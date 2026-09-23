import postgres from './postgres/index.js';

const sql = postgres(process.env.DATABASE_URL,{max:5,prepare:false,idle_timeout:20,connect_timeout:15});
const ORIGIN='https://waeljakson.github.io';
const cors=o=>({
  'Access-Control-Allow-Origin':o===ORIGIN?o:ORIGIN,
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
  'Vary':'Origin'
});
const json=(x,s=200,o='')=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json; charset=utf-8',...cors(o)}});

let schemaReady=null;
async function ensureSchema(){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await sql`create table if not exists public.teacher_private_students(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      group_id uuid references public.study_groups(id) on delete set null,
      platform_account_id uuid references public.platform_accounts(id) on delete set null,
      guardian_account_id uuid references public.platform_accounts(id) on delete set null,
      private_code text not null,
      full_name text not null,
      phone text,parent_name text,parent_phone text,
      monthly_fee numeric(12,2) not null default 0,
      joined_on date not null default current_date,
      notes text,status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(teacher_account_id,private_code)
    )`;
    await sql`create table if not exists public.teacher_private_attendance(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      group_id uuid not null references public.study_groups(id) on delete cascade,
      private_student_id uuid not null references public.teacher_private_students(id) on delete cascade,
      attendance_date date not null,
      status text not null check(status in ('present','absent','late','excused')),
      recorded_by_account_id uuid references public.platform_accounts(id) on delete set null,
      recorded_at timestamptz not null default now(),
      unique(group_id,private_student_id,attendance_date)
    )`;
    await sql`create table if not exists public.teacher_private_payments(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      group_id uuid references public.study_groups(id) on delete set null,
      private_student_id uuid not null references public.teacher_private_students(id) on delete cascade,
      amount numeric(12,2) not null check(amount>0),
      paid_on date not null default current_date,
      method text not null default 'cash',
      note text,
      recorded_by_account_id uuid references public.platform_accounts(id) on delete set null,
      created_at timestamptz not null default now()
    )`;
    await sql`create table if not exists public.teacher_assistant_links(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      assistant_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      permissions jsonb not null default '{"students":true,"attendance":true,"collections":false,"chat":true}'::jsonb,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      unique(teacher_account_id,assistant_account_id)
    )`;
    await sql`create table if not exists public.teacher_assistant_groups(
      link_id uuid not null references public.teacher_assistant_links(id) on delete cascade,
      group_id uuid not null references public.study_groups(id) on delete cascade,
      primary key(link_id,group_id)
    )`;
    await sql`create table if not exists public.teacher_room_management(
      group_id uuid primary key references public.study_groups(id) on delete cascade,
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      management_mode text not null default 'teacher' check(management_mode in ('teacher','assistant','roven')),
      service_fee numeric(12,2) not null default 0,
      fee_basis text not null default 'monthly' check(fee_basis in ('monthly','per_student','per_session','fixed','custom')),
      is_active boolean not null default true,
      updated_at timestamptz not null default now()
    )`;
    await sql`create table if not exists public.platform_certificates(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      issuer_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      student_id uuid references public.students(id) on delete cascade,
      private_student_id uuid references public.teacher_private_students(id) on delete cascade,
      title text not null,
      certificate_type text not null default 'appreciation',
      body text,
      template text not null default 'classic',
      issued_at timestamptz not null default now(),
      revoked_at timestamptz,
      check((student_id is not null) <> (private_student_id is not null))
    )`;
    await sql`create table if not exists public.platform_exams(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      owner_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      group_id uuid references public.study_groups(id) on delete set null,
      title text not null,
      instructions text,
      audience_type text not null default 'roven' check(audience_type in ('roven','private')),
      duration_minutes integer,
      opens_at timestamptz,
      closes_at timestamptz,
      is_published boolean not null default false,
      is_deleted boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
    await sql`create table if not exists public.platform_exam_questions(
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references public.platform_exams(id) on delete cascade,
      sort_order integer not null default 1,
      question_type text not null check(question_type in ('mcq','true_false','essay')),
      question_text text not null,
      choices jsonb,
      correct_answer jsonb,
      points numeric(8,2) not null default 1
    )`;
    await sql`alter table public.platform_exam_questions
      drop constraint if exists platform_exam_questions_question_type_check`;
    await sql`alter table public.platform_exam_questions
      add constraint platform_exam_questions_question_type_check
      check(question_type in ('mcq','true_false','essay'))`;
    await sql`create table if not exists public.platform_exam_attempts(
      id uuid primary key default gen_random_uuid(),
      exam_id uuid not null references public.platform_exams(id) on delete cascade,
      account_id uuid references public.platform_accounts(id) on delete set null,
      student_id uuid references public.students(id) on delete set null,
      private_student_id uuid references public.teacher_private_students(id) on delete set null,
      started_at timestamptz not null default now(),
      submitted_at timestamptz,
      answers jsonb not null default '{}'::jsonb,
      score numeric(10,2),
      max_score numeric(10,2),
      status text not null default 'started' check(status in ('started','submitted','graded')),
      graded_by_account_id uuid references public.platform_accounts(id) on delete set null,
      unique(exam_id,account_id)
    )`;
    await sql`create table if not exists public.learning_products(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      owner_account_id uuid references public.platform_accounts(id) on delete cascade,
      owner_type text not null check(owner_type in ('school','teacher')),
      product_type text not null check(product_type in ('memo','book','digital','other')),
      title text not null,
      description text,
      cost_price numeric(12,2) not null default 0,
      sale_price numeric(12,2) not null default 0,
      stock integer,
      download_url text,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`;
    await sql`create table if not exists public.learning_product_sales(
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.learning_products(id) on delete restrict,
      school_id uuid not null references public.schools(id) on delete cascade,
      sold_by_account_id uuid references public.platform_accounts(id) on delete set null,
      student_id uuid references public.students(id) on delete set null,
      private_student_id uuid references public.teacher_private_students(id) on delete set null,
      quantity integer not null default 1 check(quantity>0),
      total numeric(12,2) not null,
      paid numeric(12,2) not null default 0,
      sold_at timestamptz not null default now(),
      note text
    )`;
    await sql`create index if not exists tps_teacher_idx on public.teacher_private_students(teacher_account_id,status)`;
    await sql`create index if not exists cert_student_idx on public.platform_certificates(student_id,issued_at desc)`;
    await sql`create index if not exists exam_owner_idx on public.platform_exams(owner_account_id,created_at desc)`;
    await sql`create table if not exists public.platform_entity_archive(
      school_id uuid not null references public.schools(id) on delete cascade,
      entity_type text not null check(entity_type in ('student','teacher','group','account')),
      entity_id uuid not null,
      label text,
      snapshot jsonb,
      archived_by_account_id uuid references public.platform_accounts(id) on delete set null,
      archived_at timestamptz not null default now(),
      primary key(school_id,entity_type,entity_id)
    )`;
    await sql`create index if not exists platform_entity_archive_school_idx
      on public.platform_entity_archive(school_id,entity_type,archived_at desc)`;
  })();
  return schemaReady;
}

async function actorFromToken(token){
  let r=await sql`select a.id account_id,a.school_id,a.account_type,a.student_id,a.teacher_id,a.parent_id,a.app_user_id,u.role,a.display_name,a.internal_email
    from public.platform_sessions s
    join public.platform_accounts a on a.id=s.account_id and a.is_active=true
    left join public.app_users u on u.id=a.app_user_id and u.is_active=true
    where s.token=${token} and s.expires_at>now()
    order by s.created_at desc limit 1`;
  if(r.length)return r[0];
  r=await sql`select a.id account_id,u.school_id,coalesce(a.account_type,'admin') account_type,a.student_id,a.teacher_id,a.parent_id,a.app_user_id,u.role,a.display_name,a.internal_email
    from neon_auth.session s
    join public.app_users u on u.auth_user_id=s."userId"::text and u.is_active=true
    left join public.platform_accounts a on a.app_user_id=u.id and a.is_active=true
    where s.token=${token} and s."expiresAt">now()
    order by s."createdAt" desc limit 1`;
  return r[0]||null;
}
const must=(a,ok)=>{if(!a||!ok)throw new Error('not_authorized')};

async function assistantLink(a){
  const r=await sql`select l.*,pa.display_name teacher_name
    from public.teacher_assistant_links l
    join public.platform_accounts pa on pa.id=l.teacher_account_id
    where l.assistant_account_id=${a.account_id} and l.is_active=true limit 1`;
  return r[0]||null;
}
async function delegatedGroups(linkId){
  return await sql`select group_id from public.teacher_assistant_groups where link_id=${linkId}`;
}

async function custom(action,a,p){
  await ensureSchema();

  if(action==='teacher_private_students_list'){
    const link=await assistantLink(a);
    const teacherId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherId && (a.account_type==='teacher'||Boolean(link?.permissions?.students)));
    let groupIds=null;
    if(link)groupIds=(await delegatedGroups(link.id)).map(x=>String(x.group_id));
    const rows=await sql`select ps.*,g.name group_name,
      coalesce((select sum(pp.amount) from public.teacher_private_payments pp
        where pp.private_student_id=ps.id
          and date_trunc('month',pp.paid_on)=date_trunc('month',current_date)),0) month_paid
      from public.teacher_private_students ps
      left join public.study_groups g on g.id=ps.group_id
      where ps.teacher_account_id=${teacherId} and ps.status='active'
      order by ps.full_name`;
    return groupIds?rows.filter(x=>groupIds.includes(String(x.group_id))):rows;
  }

  if(action==='teacher_private_student_upsert'){
    const link=await assistantLink(a);
    const teacherId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherId && (a.account_type==='teacher'||Boolean(link?.permissions?.students)));
    const gid=String(p.p_group_id||'');
    if(!gid)throw new Error('group_required');
    if(link){
      const gs=(await delegatedGroups(link.id)).map(x=>String(x.group_id));
      if(!gs.includes(gid))throw new Error('group_access_denied');
    }
    const owned=await sql`select 1 from public.teacher_room_management
      where group_id=${gid}::uuid and teacher_account_id=${teacherId} and is_active=true limit 1`;
    if(!owned.length)throw new Error('private_group_required');

    const fullName=String(p.p_full_name||'').trim();
    if(!fullName)throw new Error('student_name_required');
    const existingId=String(p.p_private_student_id||'');

    if(existingId){
      const rr=await sql`update public.teacher_private_students
        set full_name=${fullName},phone=${p.p_phone||null},parent_name=${p.p_parent_name||null},
            parent_phone=${p.p_parent_phone||null},monthly_fee=${Number(p.p_monthly_fee||0)},
            joined_on=${p.p_joined_on||new Date().toISOString().slice(0,10)}::date,
            notes=${p.p_notes||null},group_id=${gid}::uuid,updated_at=now()
        where id=${existingId}::uuid and teacher_account_id=${teacherId}
        returning *`;
      if(!rr.length)throw new Error('private_student_not_found');
      return rr[0];
    }

    const code='TPS-'+Date.now().toString(36).toUpperCase();
    const pw=(await sql`select public.platform_make_password() password`)[0].password;
    const uname=code.toLowerCase();
    const acct=(await sql`insert into public.platform_accounts(
        school_id,account_type,account_code,username,internal_email,display_name,password_hash,is_active
      ) values(
        ${a.school_id},'student',${code},${uname},${code.toLowerCase()+'@roven.school'},
        ${fullName},crypt(${pw},gen_salt('bf',10)),true
      ) returning id,username,account_code,internal_email`)[0];

    let guardian=null,guardianPassword=null;
    if(String(p.p_parent_name||'').trim()){
      const gcode='ROV-PV-'+Date.now().toString(36).toUpperCase();
      guardianPassword=(await sql`select public.platform_make_password() password`)[0].password;
      guardian=(await sql`insert into public.platform_accounts(
          school_id,account_type,account_code,username,internal_email,display_name,password_hash,is_active
        ) values(
          ${a.school_id},'parent',${gcode},${gcode.toLowerCase()},
          ${gcode.toLowerCase()+'@roven.school'},${String(p.p_parent_name).trim()},
          crypt(${guardianPassword},gen_salt('bf',10)),true
        ) returning id,username,account_code,internal_email`)[0];
    }

    const row=(await sql`insert into public.teacher_private_students(
        school_id,teacher_account_id,group_id,platform_account_id,guardian_account_id,
        private_code,full_name,phone,parent_name,parent_phone,monthly_fee,joined_on,notes
      ) values(
        ${a.school_id},${teacherId},${gid}::uuid,${acct.id},${guardian?.id||null},
        ${code},${fullName},${p.p_phone||null},${p.p_parent_name||null},
        ${p.p_parent_phone||null},${Number(p.p_monthly_fee||0)},
        ${p.p_joined_on||new Date().toISOString().slice(0,10)}::date,${p.p_notes||null}
      ) returning *`)[0];

    return {
      ...row,
      student_username:acct.username,
      student_password:pw,
      student_internal_email:acct.internal_email,
      parent_username:guardian?.username||null,
      parent_password:guardianPassword,
      parent_internal_email:guardian?.internal_email||null
    };
  }

  if(action==='teacher_private_student_delete'){
    const link=await assistantLink(a);
    const teacherId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherId && (a.account_type==='teacher'||Boolean(link?.permissions?.students)));
    const id=String(p.p_private_student_id||'');
    const rr=await sql`update public.teacher_private_students
      set status='deleted',updated_at=now()
      where id=${id}::uuid and teacher_account_id=${teacherId}
      returning platform_account_id,guardian_account_id`;
    if(!rr.length)throw new Error('private_student_not_found');
    if(rr[0].platform_account_id)await sql`update public.platform_accounts set is_active=false,updated_at=now() where id=${rr[0].platform_account_id}`;
    if(rr[0].guardian_account_id)await sql`update public.platform_accounts set is_active=false,updated_at=now() where id=${rr[0].guardian_account_id}`;
    return {deleted:true};
  }

  if(action==='teacher_private_attendance_save'){
    const link=await assistantLink(a);
    const teacherId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherId && (a.account_type==='teacher'||Boolean(link?.permissions?.attendance)));
    const gid=String(p.p_group_id||'');
    if(link){
      const gs=(await delegatedGroups(link.id)).map(x=>String(x.group_id));
      if(!gs.includes(gid))throw new Error('group_access_denied');
    }
    for(const r of (p.p_records||[])){
      await sql`insert into public.teacher_private_attendance(
        school_id,teacher_account_id,group_id,private_student_id,attendance_date,status,recorded_by_account_id
      ) values(
        ${a.school_id},${teacherId},${gid}::uuid,${r.private_student_id}::uuid,
        ${p.p_date}::date,${r.status},${a.account_id}
      )
      on conflict(group_id,private_student_id,attendance_date)
      do update set status=excluded.status,recorded_by_account_id=excluded.recorded_by_account_id,recorded_at=now()`;
    }
    return {saved:(p.p_records||[]).length};
  }

  if(action==='teacher_private_payment_add'){
    const link=await assistantLink(a);
    const teacherId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherId && (a.account_type==='teacher'||Boolean(link?.permissions?.collections)));
    const s=(await sql`select * from public.teacher_private_students
      where id=${p.p_private_student_id}::uuid and teacher_account_id=${teacherId} and status='active' limit 1`)[0];
    if(!s)throw new Error('private_student_not_found');
    return (await sql`insert into public.teacher_private_payments(
      school_id,teacher_account_id,group_id,private_student_id,amount,paid_on,method,note,recorded_by_account_id
    ) values(
      ${a.school_id},${teacherId},${s.group_id},${s.id},${Number(p.p_amount||0)},
      ${p.p_date||new Date().toISOString().slice(0,10)}::date,${p.p_method||'cash'},
      ${p.p_note||null},${a.account_id}
    ) returning *`)[0];
  }

  if(action==='teacher_assistants_list'){
    must(a,a.account_type==='teacher');
    return await sql`select l.id link_id,l.assistant_account_id,l.permissions,l.is_active,
      pa.display_name,pa.username,pa.account_code,pa.internal_email,
      coalesce((select jsonb_agg(g.group_id) from public.teacher_assistant_groups g where g.link_id=l.id),'[]'::jsonb) group_ids
      from public.teacher_assistant_links l
      join public.platform_accounts pa on pa.id=l.assistant_account_id
      where l.teacher_account_id=${a.account_id}
      order by pa.display_name`;
  }

  if(action==='teacher_assistant_create'){
    must(a,a.account_type==='teacher');
    const pw=(await sql`select public.platform_make_password() password`)[0].password;
    const code='ROV-AS-'+Date.now().toString(36).toUpperCase();
    const uname=code.toLowerCase();
    const acct=(await sql`insert into public.platform_accounts(
      school_id,account_type,account_code,username,internal_email,display_name,password_hash,is_active
    ) values(
      ${a.school_id},'staff',${code},${uname},${code.toLowerCase()+'@roven.school'},
      ${String(p.p_name||'مساعد المعلم').trim()},crypt(${pw},gen_salt('bf',10)),true
    ) returning *`)[0];
    const link=(await sql`insert into public.teacher_assistant_links(
      school_id,teacher_account_id,assistant_account_id,permissions
    ) values(
      ${a.school_id},${a.account_id},${acct.id},${JSON.stringify(p.p_permissions||{})}::jsonb
    ) returning *`)[0];
    for(const gid of (p.p_group_ids||[])){
      await sql`insert into public.teacher_assistant_groups(link_id,group_id)
        values(${link.id},${gid}::uuid) on conflict do nothing`;
    }
    return {
      link_id:link.id,account_id:acct.id,username:acct.username,
      account_code:acct.account_code,internal_email:acct.internal_email,
      generated_password:pw
    };
  }

  if(action==='teacher_assistant_update'){
    must(a,a.account_type==='teacher');
    const lid=String(p.p_link_id||'');
    const link=(await sql`update public.teacher_assistant_links
      set permissions=${JSON.stringify(p.p_permissions||{})}::jsonb,
          is_active=${p.p_is_active!==false}
      where id=${lid}::uuid and teacher_account_id=${a.account_id}
      returning *`)[0];
    if(!link)throw new Error('assistant_not_found');
    await sql`delete from public.teacher_assistant_groups where link_id=${lid}::uuid`;
    for(const gid of (p.p_group_ids||[])){
      await sql`insert into public.teacher_assistant_groups(link_id,group_id) values(${lid}::uuid,${gid}::uuid)`;
    }
    await sql`update public.platform_accounts set is_active=${p.p_is_active!==false},updated_at=now() where id=${link.assistant_account_id}`;
    return {updated:true};
  }

  if(action==='teacher_assistant_delete'){
    must(a,a.account_type==='teacher');
    const link=(await sql`delete from public.teacher_assistant_links
      where id=${p.p_link_id}::uuid and teacher_account_id=${a.account_id}
      returning assistant_account_id`)[0];
    if(!link)throw new Error('assistant_not_found');
    await sql`update public.platform_accounts set is_active=false,updated_at=now() where id=${link.assistant_account_id}`;
    return {deleted:true};
  }

  if(action==='assistant_context'){
    const link=await assistantLink(a);
    must(a,Boolean(link));
    const gs=await delegatedGroups(link.id);
    return {
      account_type:'teacher_assistant',
      role:'teacher_assistant',
      teacher_account_id:link.teacher_account_id,
      teacher_name:link.teacher_name,
      permissions:link.permissions,
      group_ids:gs.map(x=>x.group_id)
    };
  }

  if(action==='parent_dashboard'){
    let schoolStudentIds=[];
    let privateIds=[];
    if(a.parent_id){
      schoolStudentIds=(await sql`select student_id from public.student_parents where parent_id=${a.parent_id}`).map(x=>x.student_id);
    }
    privateIds=(await sql`select id from public.teacher_private_students where guardian_account_id=${a.account_id} and status='active'`).map(x=>x.id);

    const schoolStudents=schoolStudentIds.length?await sql`select s.id,s.student_no,s.full_name,g.name grade_name,
      coalesce((select sum(i.balance) from public.invoices i where i.student_id=s.id and i.status<>'void'),0) balance,
      coalesce((select sum(l.points) from public.student_point_ledger l where l.student_id=s.id),0)::int points
      from public.students s
      left join public.grades g on g.id=s.grade_id
      where s.id=any(${schoolStudentIds}::uuid[])`:[];
    const privateStudents=privateIds.length?await sql`select ps.id,ps.private_code,ps.full_name,ps.monthly_fee,
      coalesce((select sum(p.amount) from public.teacher_private_payments p
        where p.private_student_id=ps.id and date_trunc('month',p.paid_on)=date_trunc('month',current_date)),0) month_paid
      from public.teacher_private_students ps
      where ps.id=any(${privateIds}::uuid[])`:[];
    const certs=await sql`select c.*,s.full_name student_name,ps.full_name private_student_name
      from public.platform_certificates c
      left join public.students s on s.id=c.student_id
      left join public.teacher_private_students ps on ps.id=c.private_student_id
      where c.revoked_at is null
        and ((c.student_id=any(${schoolStudentIds}::uuid[])) or (c.private_student_id=any(${privateIds}::uuid[])))
      order by c.issued_at desc`;
    const results=await sql`select at.id attempt_id,e.title,at.score,at.max_score,at.submitted_at,
      s.full_name student_name,ps.full_name private_student_name
      from public.platform_exam_attempts at
      join public.platform_exams e on e.id=at.exam_id
      left join public.students s on s.id=at.student_id
      left join public.teacher_private_students ps on ps.id=at.private_student_id
      where at.status='graded'
        and ((at.student_id=any(${schoolStudentIds}::uuid[])) or (at.private_student_id=any(${privateIds}::uuid[])))
      order by at.submitted_at desc`;
    return {school_students:schoolStudents,private_students:privateStudents,certificates:certs,exam_results:results};
  }

  if(action==='student_dashboard'){
    let sid=a.student_id,psid=null;
    if(!sid){
      const ps=(await sql`select id from public.teacher_private_students
        where platform_account_id=${a.account_id} and status='active' limit 1`)[0];
      psid=ps?.id||null;
    }
    const certs=await sql`select * from public.platform_certificates
      where revoked_at is null and (student_id=${sid||null} or private_student_id=${psid})
      order by issued_at desc`;
    const results=await sql`select at.id attempt_id,e.title,at.score,at.max_score,at.submitted_at
      from public.platform_exam_attempts at
      join public.platform_exams e on e.id=at.exam_id
      where at.status='graded' and (at.student_id=${sid||null} or at.private_student_id=${psid})
      order by at.submitted_at desc`;
    return {student_id:sid,private_student_id:psid,certificates:certs,exam_results:results};
  }

  if(action==='certificate_create'){
    const link=await assistantLink(a);
    must(a,a.account_type==='teacher'||a.account_type==='admin'||(a.account_type==='staff'&&!link));
    const sid=p.p_student_id||null,psid=p.p_private_student_id||null;
    if(a.account_type==='teacher'&&sid){
      const ok=await sql`select 1
        from public.enrollments en
        join public.study_groups g on g.id=en.group_id
        join public.courses c on c.id=g.course_id
        where en.student_id=${sid}::uuid and c.teacher_id=${a.teacher_id} and en.status='active' limit 1`;
      if(!ok.length)throw new Error('student_not_assigned');
    }
    if(a.account_type==='teacher'&&psid){
      const ok=await sql`select 1 from public.teacher_private_students
        where id=${psid}::uuid and teacher_account_id=${a.account_id} and status='active' limit 1`;
      if(!ok.length)throw new Error('private_student_not_found');
    }
    return (await sql`insert into public.platform_certificates(
      school_id,issuer_account_id,student_id,private_student_id,title,certificate_type,body,template
    ) values(
      ${a.school_id},${a.account_id},${sid},${psid},${String(p.p_title||'شهادة تقدير')},
      ${p.p_type||'appreciation'},${p.p_body||null},${p.p_template||'classic'}
    ) returning *`)[0];
  }

  if(action==='certificate_list_owned'){
    must(a,a.account_type==='teacher'||a.account_type==='admin'||a.account_type==='staff');
    return await sql`select c.*,s.full_name student_name,ps.full_name private_student_name
      from public.platform_certificates c
      left join public.students s on s.id=c.student_id
      left join public.teacher_private_students ps on ps.id=c.private_student_id
      where c.issuer_account_id=${a.account_id} and c.revoked_at is null
      order by c.issued_at desc`;
  }

  if(action==='certificate_delete'){
    const rr=await sql`update public.platform_certificates set revoked_at=now()
      where id=${p.p_certificate_id}::uuid
        and (issuer_account_id=${a.account_id} or ${String(a.role||'')}='super_admin')
      returning id`;
    if(!rr.length)throw new Error('certificate_not_found');
    return {deleted:true};
  }

  if(action==='exam_create'){
    must(a,a.account_type==='teacher'||a.account_type==='admin'||String(a.role||'')==='academic_admin');
    return (await sql`insert into public.platform_exams(
      school_id,owner_account_id,group_id,title,instructions,audience_type,duration_minutes,opens_at,closes_at
    ) values(
      ${a.school_id},${a.account_id},${p.p_group_id||null},${String(p.p_title||'اختبار جديد')},
      ${p.p_instructions||null},${p.p_audience_type||'roven'},${p.p_duration_minutes||null},
      ${p.p_opens_at||null},${p.p_closes_at||null}
    ) returning *`)[0];
  }

  if(action==='exam_save_questions'){
    const ex=(await sql`select * from public.platform_exams
      where id=${p.p_exam_id}::uuid and owner_account_id=${a.account_id} and is_deleted=false limit 1`)[0];
    if(!ex)throw new Error('exam_not_found');
    await sql`delete from public.platform_exam_questions where exam_id=${ex.id}`;
    let i=0;
    for(const q of (p.p_questions||[])){
      i++;
      await sql`insert into public.platform_exam_questions(
        exam_id,sort_order,question_type,question_text,choices,correct_answer,points
      ) values(
        ${ex.id},${i},${q.type},${q.text},${JSON.stringify(q.choices||null)}::jsonb,
        ${JSON.stringify(q.correct_answer??null)}::jsonb,${Number(q.points||1)}
      )`;
    }
    return {saved:i};
  }

  if(action==='exam_publish'){
    const rr=await sql`update public.platform_exams
      set is_published=${p.p_publish!==false},updated_at=now()
      where id=${p.p_exam_id}::uuid and owner_account_id=${a.account_id} and is_deleted=false
      returning *`;
    if(!rr.length)throw new Error('exam_not_found');
    return rr[0];
  }

  if(action==='exam_delete'){
    const rr=await sql`update public.platform_exams
      set is_deleted=true,is_published=false,updated_at=now()
      where id=${p.p_exam_id}::uuid and owner_account_id=${a.account_id}
      returning id`;
    if(!rr.length)throw new Error('exam_not_found');
    return {deleted:true};
  }

  if(action==='exam_list_owned'){
    return await sql`select e.*,
      coalesce((select count(*) from public.platform_exam_questions q where q.exam_id=e.id),0)::int question_count,
      coalesce((select count(*) from public.platform_exam_attempts at where at.exam_id=e.id),0)::int attempt_count
      from public.platform_exams e
      where e.owner_account_id=${a.account_id} and e.is_deleted=false
      order by e.created_at desc`;
  }

  if(action==='exam_my_available'){
    let sid=a.student_id;
    let psid=(await sql`select id from public.teacher_private_students
      where platform_account_id=${a.account_id} and status='active' limit 1`)[0]?.id||null;
    if(sid){
      return await sql`select distinct e.id,e.title,e.instructions,e.duration_minutes,e.opens_at,e.closes_at
        from public.platform_exams e
        join public.enrollments en on en.group_id=e.group_id and en.student_id=${sid}
        where e.is_published=true and e.is_deleted=false and e.audience_type='roven'
          and (e.opens_at is null or e.opens_at<=now()) and (e.closes_at is null or e.closes_at>=now())`;
    }
    if(psid){
      return await sql`select e.id,e.title,e.instructions,e.duration_minutes,e.opens_at,e.closes_at
        from public.platform_exams e
        join public.teacher_private_students ps on ps.group_id=e.group_id
        where ps.id=${psid} and e.is_published=true and e.is_deleted=false and e.audience_type='private'
          and (e.opens_at is null or e.opens_at<=now()) and (e.closes_at is null or e.closes_at>=now())`;
    }
    return [];
  }

  if(action==='exam_get'){
    const e=(await sql`select * from public.platform_exams
      where id=${p.p_exam_id}::uuid and is_published=true and is_deleted=false limit 1`)[0];
    if(!e)throw new Error('exam_not_found');
    const qs=await sql`select id,sort_order,question_type,question_text,choices,points
      from public.platform_exam_questions where exam_id=${e.id} order by sort_order`;
    return {...e,questions:qs};
  }

  if(action==='exam_submit'){
    const e=(await sql`select * from public.platform_exams
      where id=${p.p_exam_id}::uuid and is_published=true and is_deleted=false limit 1`)[0];
    if(!e)throw new Error('exam_not_found');
    const qs=await sql`select * from public.platform_exam_questions where exam_id=${e.id} order by sort_order`;
    let score=0,max=0,hasEssay=false;
    const answers=p.p_answers||{};
    for(const q of qs){
      max+=Number(q.points||0);
      if(q.question_type==='essay'){hasEssay=true;continue}
      const expected=q.correct_answer;
      const got=answers[String(q.id)];
      if(JSON.stringify(got)===JSON.stringify(expected))score+=Number(q.points||0);
    }
    const psid=(await sql`select id from public.teacher_private_students
      where platform_account_id=${a.account_id} and status='active' limit 1`)[0]?.id||null;
    return (await sql`insert into public.platform_exam_attempts(
      exam_id,account_id,student_id,private_student_id,submitted_at,answers,score,max_score,status
    ) values(
      ${e.id},${a.account_id},${a.student_id||null},${psid},now(),${JSON.stringify(answers)}::jsonb,
      ${score},${max},${hasEssay?'submitted':'graded'}
    )
    on conflict(exam_id,account_id) do update set
      submitted_at=now(),answers=excluded.answers,score=excluded.score,max_score=excluded.max_score,status=excluded.status
    returning *`)[0];
  }

  if(action==='exam_attempts_owned'){
    return await sql`select at.*,e.title,s.full_name student_name,ps.full_name private_student_name
      from public.platform_exam_attempts at
      join public.platform_exams e on e.id=at.exam_id
      left join public.students s on s.id=at.student_id
      left join public.teacher_private_students ps on ps.id=at.private_student_id
      where e.owner_account_id=${a.account_id}
      order by at.submitted_at desc nulls last`;
  }

  if(action==='exam_grade_essay'){
    const at=(await sql`select at.id from public.platform_exam_attempts at
      join public.platform_exams e on e.id=at.exam_id
      where at.id=${p.p_attempt_id}::uuid and e.owner_account_id=${a.account_id} limit 1`)[0];
    if(!at)throw new Error('attempt_not_found');
    return (await sql`update public.platform_exam_attempts
      set score=${Number(p.p_score||0)},status='graded',graded_by_account_id=${a.account_id}
      where id=${at.id} returning *`)[0];
  }

  if(action==='products_list'){
    if(a.account_type==='teacher'){
      return await sql`select * from public.learning_products
        where school_id=${a.school_id} and is_active=true
          and ((owner_type='teacher' and owner_account_id=${a.account_id}) or owner_type='school')
        order by created_at desc`;
    }
    return await sql`select * from public.learning_products
      where school_id=${a.school_id} and is_active=true order by created_at desc`;
  }

  if(action==='product_create'){
    must(a,a.account_type==='teacher'||a.account_type==='admin'||String(a.role||'')==='school_manager'||String(a.role||'')==='finance_admin');
    const ownerType=a.account_type==='teacher'?'teacher':'school';
    const ownerId=ownerType==='teacher'?a.account_id:null;
    return (await sql`insert into public.learning_products(
      school_id,owner_account_id,owner_type,product_type,title,description,cost_price,sale_price,stock,download_url
    ) values(
      ${a.school_id},${ownerId},${ownerType},${p.p_product_type||'memo'},${p.p_title},
      ${p.p_description||null},${Number(p.p_cost_price||0)},${Number(p.p_sale_price||0)},
      ${p.p_stock===null?null:Number(p.p_stock||0)},${p.p_download_url||null}
    ) returning *`)[0];
  }

  if(action==='product_delete'){
    const rr=await sql`update public.learning_products set is_active=false,updated_at=now()
      where id=${p.p_product_id}::uuid
        and (owner_account_id=${a.account_id}
          or (owner_type='school' and ${String(a.role||'')} in ('super_admin','school_manager','finance_admin')))
      returning id`;
    if(!rr.length)throw new Error('product_not_found');
    return {deleted:true};
  }

  if(action==='product_sale_add'){
    const pr=(await sql`select * from public.learning_products
      where id=${p.p_product_id}::uuid and school_id=${a.school_id} and is_active=true limit 1`)[0];
    if(!pr)throw new Error('product_not_found');
    if(pr.owner_type==='teacher'){
      const link=await assistantLink(a);
      must(a,a.account_id===pr.owner_account_id||Boolean(link?.permissions?.collections));
    }
    const qty=Math.max(1,Number(p.p_quantity||1));
    const total=Number(p.p_total??Number(pr.sale_price)*qty);
    const paid=Number(p.p_paid??total);
    const sale=(await sql`insert into public.learning_product_sales(
      product_id,school_id,sold_by_account_id,student_id,private_student_id,quantity,total,paid,note
    ) values(
      ${pr.id},${a.school_id},${a.account_id},${p.p_student_id||null},${p.p_private_student_id||null},
      ${qty},${total},${paid},${p.p_note||null}
    ) returning *`)[0];
    if(pr.stock!==null)await sql`update public.learning_products set stock=greatest(0,stock-${qty}),updated_at=now() where id=${pr.id}`;
    return sale;
  }

  if(action==='product_sales_summary'){
    if(a.account_type==='teacher'){
      return await sql`select p.id,p.title,p.product_type,p.sale_price,p.cost_price,p.stock,
        coalesce(sum(s.quantity),0)::int sold_qty,coalesce(sum(s.total),0) sales_total,coalesce(sum(s.paid),0) paid_total
        from public.learning_products p
        left join public.learning_product_sales s on s.product_id=p.id
        where p.owner_type='teacher' and p.owner_account_id=${a.account_id}
        group by p.id order by p.created_at desc`;
    }
    return await sql`select p.id,p.title,p.product_type,p.sale_price,p.cost_price,p.stock,
      coalesce(sum(s.quantity),0)::int sold_qty,coalesce(sum(s.total),0) sales_total,coalesce(sum(s.paid),0) paid_total
      from public.learning_products p
      left join public.learning_product_sales s on s.product_id=p.id
      where p.owner_type='school' and p.school_id=${a.school_id}
      group by p.id order by p.created_at desc`;
  }

  if(action==='teacher_roven_contacts'){
    must(a,a.account_type==='teacher');
    return await sql`select distinct s.id student_id,s.full_name,s.phone,
      p.full_name parent_name,p.phone parent_phone,g.id group_id,g.name group_name
      from public.courses c
      join public.study_groups g on g.course_id=c.id
      join public.enrollments en on en.group_id=g.id and en.status='active'
      join public.students s on s.id=en.student_id
      left join public.student_parents sp on sp.student_id=s.id
      left join public.parents p on p.id=sp.parent_id
      where c.teacher_id=${a.teacher_id} and s.status='active'
      order by s.full_name`;
  }

  if(action==='school_contacts'){
    must(a,a.account_type==='admin'||String(a.role||'')==='secretary'||String(a.role||'')==='reception');
    return await sql`select s.id student_id,s.full_name,s.phone,
      p.full_name parent_name,p.phone parent_phone,g.name grade_name
      from public.students s
      left join public.grades g on g.id=s.grade_id
      left join public.student_parents sp on sp.student_id=s.id
      left join public.parents p on p.id=sp.parent_id
      where s.school_id=${a.school_id} and s.status='active'
      order by s.full_name`;
  }

  const adminEntityAllowed=()=>a.account_type==='admin'||['super_admin','school_manager'].includes(String(a.role||''));

  if(action==='admin_accounts_all'){
    must(a,adminEntityAllowed());
    return await sql`select pa.id account_id,pa.account_type,pa.account_code,pa.username,pa.internal_email,
      pa.display_name,pa.is_active,pa.student_id,pa.teacher_id,pa.parent_id,pa.app_user_id,u.role
      from public.platform_accounts pa
      left join public.app_users u on u.id=pa.app_user_id
      where pa.school_id=${a.school_id}
        and not exists(
          select 1 from public.platform_entity_archive ar
          where ar.school_id=pa.school_id and ar.entity_type='account' and ar.entity_id=pa.id
        )
        and not exists(
          select 1 from public.platform_entity_archive ar
          where ar.school_id=pa.school_id and (
            (ar.entity_type='student' and ar.entity_id=pa.student_id) or
            (ar.entity_type='teacher' and ar.entity_id=pa.teacher_id)
          )
        )
      order by pa.display_name nulls last,pa.created_at desc`;
  }

  if(action==='admin_students_all'){
    must(a,adminEntityAllowed());
    return await sql`select s.*,s.id student_id,g.name grade_name,
      pa.id account_id,pa.account_code,pa.username,pa.internal_email,coalesce(pa.is_active,false) account_active
      from public.students s
      left join public.grades g on g.id=s.grade_id
      left join public.platform_accounts pa on pa.student_id=s.id
      where s.school_id=${a.school_id}
        and not exists(
          select 1 from public.platform_entity_archive ar
          where ar.school_id=s.school_id and ar.entity_type='student' and ar.entity_id=s.id
        )
      order by (s.status='active') desc,s.full_name`;
  }

  if(action==='admin_teachers_all'){
    must(a,adminEntityAllowed());
    return await sql`select t.*,t.id teacher_id,
      pa.id account_id,pa.account_code,pa.username,pa.internal_email,coalesce(pa.is_active,false) account_active
      from public.teachers t
      left join public.platform_accounts pa on pa.teacher_id=t.id
      where t.school_id=${a.school_id}
        and not exists(
          select 1 from public.platform_entity_archive ar
          where ar.school_id=t.school_id and ar.entity_type='teacher' and ar.entity_id=t.id
        )
      order by (t.status='active') desc,t.full_name`;
  }

  if(action==='admin_groups_all'){
    must(a,adminEntityAllowed());
    return await sql`select g.id group_id,g.name group_name,g.schedule_json,g.meeting_url,g.meeting_provider,g.is_active,
      coalesce((select count(*) from public.enrollments en where en.group_id=g.id and en.status='active'),0)::int students_count
      from public.study_groups g
      where g.school_id=${a.school_id}
        and not exists(
          select 1 from public.platform_entity_archive ar
          where ar.school_id=g.school_id and ar.entity_type='group' and ar.entity_id=g.id
        )
      order by g.is_active desc,g.name`;
  }

  if(action==='admin_entity_set_active'){
    must(a,adminEntityAllowed());
    const type=String(p.p_type||''),id=String(p.p_id||''),active=p.p_active!==false;
    if(!id)throw new Error('entity_id_required');
    if(type==='account'){
      if(String(id)===String(a.account_id)&&!active)throw new Error('cannot_disable_current_account');
      const target=(await sql`select id,app_user_id from public.platform_accounts
        where id=${id}::uuid and school_id=${a.school_id} limit 1`)[0];
      if(!target)throw new Error('account_not_found');
      await sql`update public.platform_accounts set is_active=${active},updated_at=now() where id=${id}::uuid`;
      if(target.app_user_id)await sql`update public.app_users set is_active=${active},updated_at=now() where id=${target.app_user_id}`;
    }else if(type==='student'){
      await sql`update public.students set status=${active?'active':'withdrawn'} where id=${id}::uuid and school_id=${a.school_id}`;
      const accts=await sql`select id,app_user_id from public.platform_accounts where student_id=${id}::uuid and school_id=${a.school_id}`;
      await sql`update public.platform_accounts set is_active=${active},updated_at=now() where student_id=${id}::uuid and school_id=${a.school_id}`;
      for(const x of accts)if(x.app_user_id)await sql`update public.app_users set is_active=${active},updated_at=now() where id=${x.app_user_id}`;
    }else if(type==='teacher'){
      await sql`update public.teachers set status=${active?'active':'inactive'} where id=${id}::uuid and school_id=${a.school_id}`;
      const accts=await sql`select id,app_user_id from public.platform_accounts where teacher_id=${id}::uuid and school_id=${a.school_id}`;
      await sql`update public.platform_accounts set is_active=${active},updated_at=now() where teacher_id=${id}::uuid and school_id=${a.school_id}`;
      for(const x of accts)if(x.app_user_id)await sql`update public.app_users set is_active=${active},updated_at=now() where id=${x.app_user_id}`;
    }else if(type==='group'){
      await sql`update public.study_groups set is_active=${active} where id=${id}::uuid and school_id=${a.school_id}`;
      await sql`update public.teacher_room_management set is_active=${active},updated_at=now()
        where group_id=${id}::uuid and school_id=${a.school_id}`;
    }else throw new Error('unsupported_entity');
    return {updated:true,is_active:active};
  }

  if(action==='admin_entity_delete'){
    must(a,adminEntityAllowed());
    const type=String(p.p_type||''),id=String(p.p_id||'');
    if(!id)throw new Error('entity_id_required');
    if(type==='account'&&String(id)===String(a.account_id))throw new Error('cannot_delete_current_account');

    let label=null,snapshot=null;
    if(type==='student'){
      const row=(await sql`select * from public.students where id=${id}::uuid and school_id=${a.school_id} limit 1`)[0];
      if(!row)throw new Error('student_not_found');
      label=row.full_name;snapshot=row;
      await sql`update public.students set status='withdrawn' where id=${id}::uuid and school_id=${a.school_id}`;
      const accts=await sql`select id,app_user_id from public.platform_accounts where student_id=${id}::uuid and school_id=${a.school_id}`;
      await sql`update public.platform_accounts set is_active=false,updated_at=now() where student_id=${id}::uuid and school_id=${a.school_id}`;
      for(const x of accts)if(x.app_user_id)await sql`update public.app_users set is_active=false,updated_at=now() where id=${x.app_user_id}`;
    }else if(type==='teacher'){
      const row=(await sql`select * from public.teachers where id=${id}::uuid and school_id=${a.school_id} limit 1`)[0];
      if(!row)throw new Error('teacher_not_found');
      label=row.full_name;snapshot=row;
      await sql`update public.teachers set status='inactive' where id=${id}::uuid and school_id=${a.school_id}`;
      const accts=await sql`select id,app_user_id from public.platform_accounts where teacher_id=${id}::uuid and school_id=${a.school_id}`;
      await sql`update public.platform_accounts set is_active=false,updated_at=now() where teacher_id=${id}::uuid and school_id=${a.school_id}`;
      for(const x of accts)if(x.app_user_id)await sql`update public.app_users set is_active=false,updated_at=now() where id=${x.app_user_id}`;
    }else if(type==='group'){
      const row=(await sql`select * from public.study_groups where id=${id}::uuid and school_id=${a.school_id} limit 1`)[0];
      if(!row)throw new Error('group_not_found');
      label=row.name;snapshot=row;
      await sql`update public.study_groups set is_active=false where id=${id}::uuid and school_id=${a.school_id}`;
      await sql`update public.teacher_room_management set is_active=false,updated_at=now()
        where group_id=${id}::uuid and school_id=${a.school_id}`;
    }else if(type==='account'){
      const row=(await sql`select id,account_type,account_code,username,internal_email,display_name,is_active,app_user_id
        from public.platform_accounts where id=${id}::uuid and school_id=${a.school_id} limit 1`)[0];
      if(!row)throw new Error('account_not_found');
      label=row.display_name;snapshot=row;
      await sql`update public.platform_accounts set is_active=false,updated_at=now() where id=${id}::uuid`;
      if(row.app_user_id)await sql`update public.app_users set is_active=false,updated_at=now() where id=${row.app_user_id}`;
    }else throw new Error('unsupported_entity');

    await sql`insert into public.platform_entity_archive(
      school_id,entity_type,entity_id,label,snapshot,archived_by_account_id,archived_at
    ) values(
      ${a.school_id},${type},${id}::uuid,${label},${JSON.stringify(snapshot||{})}::jsonb,${a.account_id},now()
    ) on conflict(school_id,entity_type,entity_id)
      do update set label=excluded.label,snapshot=excluded.snapshot,
        archived_by_account_id=excluded.archived_by_account_id,archived_at=now()`;
    return {deleted:true,soft_delete:true};
  }

  if(action==='archive_school_entity'){
    // Backward-compatible alias: archive means deactivate, not hard delete.
    return await custom('admin_entity_set_active',a,{p_type:p.p_type,p_id:p.p_id,p_active:false});
  }

  throw new Error('unknown_custom_action');
}

async function decorateLogin(result){
  if(!result?.account_id)return result;
  await ensureSchema();
  const link=(await sql`select l.*,pa.display_name teacher_name
    from public.teacher_assistant_links l
    join public.platform_accounts pa on pa.id=l.teacher_account_id
    where l.assistant_account_id=${result.account_id} and l.is_active=true limit 1`)[0];
  if(link)return {...result,account_type:'teacher_assistant',role:'teacher_assistant',
    teacher_account_id:link.teacher_account_id,teacher_name:link.teacher_name,permissions:link.permissions};
  const ps=(await sql`select id from public.teacher_private_students
    where platform_account_id=${result.account_id} and status='active' limit 1`)[0];
  if(ps)return {...result,account_type:'private_student',role:'private_student',private_student_id:ps.id};
  const pg=(await sql`select id from public.teacher_private_students
    where guardian_account_id=${result.account_id} and status='active' limit 1`)[0];
  if(pg)return {...result,account_type:'private_parent',role:'private_parent'};
  return result;
}

export default{
  async fetch(req){
    const o=req.headers.get('origin')||'';
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(o)});
    if(req.method==='GET'){
      try{await ensureSchema();return json({ok:true,service:'rovenapi'},200,o)}
      catch(e){return json({ok:false,error:String(e?.message||e)},500,o)}
    }
    if(req.method!=='POST')return json({error:'method_not_allowed'},405,o);

    try{
      const b=await req.json();
      const action=String(b?.action||'');
      const token=String(b?.sessionToken||'');
      const p=b?.payload&&typeof b.payload==='object'?b.payload:{};

      if(action==='platform_login'){
        const rows=await sql`select public.roven_rpc('platform_login',${token},${JSON.stringify(p)}::jsonb) result`;
        return json(await decorateLogin(rows[0]?.result??null),200,o);
      }

      const customActions=new Set([
        'teacher_private_students_list','teacher_private_student_upsert','teacher_private_student_delete',
        'teacher_private_attendance_save','teacher_private_payment_add',
        'teacher_assistants_list','teacher_assistant_create','teacher_assistant_update','teacher_assistant_delete',
        'assistant_context','parent_dashboard','student_dashboard',
        'certificate_create','certificate_list_owned','certificate_delete',
        'exam_create','exam_save_questions','exam_publish','exam_delete','exam_list_owned',
        'exam_my_available','exam_get','exam_submit','exam_attempts_owned','exam_grade_essay',
        'products_list','product_create','product_delete','product_sale_add','product_sales_summary',
        'teacher_roven_contacts','school_contacts','archive_school_entity',
        'admin_accounts_all','admin_students_all','admin_teachers_all','admin_groups_all',
        'admin_entity_set_active','admin_entity_delete'
      ]);

      if(customActions.has(action)){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);
        return json(await custom(action,a,p),200,o);
      }

      const rows=await sql`select public.roven_rpc(${action},${token},${JSON.stringify(p)}::jsonb) result`;
      let result=rows[0]?.result??null;
      if(action==='platform_my_profile')result=await decorateLogin(result);
      return json(result,200,o);
    }catch(e){
      const m=String(e?.message||e||'server_error');
      const s=/not_authorized|invalid_or_expired_session|access_denied/.test(m)?401:400;
      return json({error:m},s,o);
    }
  }
};
