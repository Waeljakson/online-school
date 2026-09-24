import postgres from 'postgres';

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
    await sql`alter table public.teacher_private_students add column if not exists books_fee numeric(12,2) not null default 0`;
    await sql`alter table public.teacher_private_students add column if not exists books_free boolean not null default false`;
    await sql`create table if not exists public.teacher_private_attendance(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      group_id uuid not null references public.study_groups(id) on delete cascade,
      private_student_id uuid not null references public.teacher_private_students(id) on delete cascade,
      attendance_date date not null,
      status text not null check(status in ('present','absent','late','excused','left_early')),
      minutes_late integer not null default 0,
      note text,
      recorded_by_account_id uuid references public.platform_accounts(id) on delete set null,
      recorded_at timestamptz not null default now(),
      unique(group_id,private_student_id,attendance_date)
    )`;
    await sql`alter table public.teacher_private_attendance add column if not exists minutes_late integer not null default 0`;
    await sql`alter table public.teacher_private_attendance add column if not exists note text`;
    await sql`create table if not exists public.teacher_private_point_ledger(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      group_id uuid references public.study_groups(id) on delete set null,
      private_student_id uuid not null references public.teacher_private_students(id) on delete cascade,
      points integer not null check(points<>0),
      reason text not null,
      category text,
      issued_by_account_id uuid references public.platform_accounts(id) on delete set null,
      created_at timestamptz not null default now()
    )`;
    await sql`create index if not exists teacher_private_point_ledger_student_idx
      on public.teacher_private_point_ledger(private_student_id,created_at desc)`;
    await sql`alter table public.teacher_private_attendance drop constraint if exists teacher_private_attendance_status_check`;
    await sql`alter table public.teacher_private_attendance add constraint teacher_private_attendance_status_check
      check(status in ('present','absent','late','excused','left_early'))`;
    await sql`create table if not exists public.teacher_room_fee_payments(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      teacher_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      group_id uuid not null references public.study_groups(id) on delete cascade,
      billing_period text not null,
      amount numeric(12,2) not null check(amount>0),
      paid_on date not null default current_date,
      method text not null default 'cash',
      note text,
      receipt_no text not null,
      recorded_by_account_id uuid references public.platform_accounts(id) on delete set null,
      created_at timestamptz not null default now(),
      voided_at timestamptz,
      voided_by_account_id uuid references public.platform_accounts(id) on delete set null,
      void_reason text,
      unique(school_id,receipt_no)
    )`;
    await sql`create index if not exists teacher_room_fee_payments_room_period_idx
      on public.teacher_room_fee_payments(group_id,billing_period,paid_on desc)`;

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
    await sql`alter table public.teacher_private_payments add column if not exists payment_kind text not null default 'tuition'`;

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
    await sql`alter table public.teacher_room_management add column if not exists capacity integer`;
    await sql`alter table public.teacher_room_management add column if not exists agreed_price numeric(12,2) not null default 0`;
    await sql`alter table public.teacher_room_management add column if not exists pricing_basis text not null default 'monthly'`;
    await sql`alter table public.teacher_room_management drop constraint if exists teacher_room_management_capacity_check`;
    await sql`alter table public.teacher_room_management add constraint teacher_room_management_capacity_check check(capacity is null or capacity>0)`;
    await sql`alter table public.teacher_assistant_links add column if not exists contact_email text`;
    await sql`alter table public.teacher_assistant_links add column if not exists contact_phone text`;
    await sql`create table if not exists public.platform_direct_messages_v2(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      sender_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      recipient_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      body text,
      attachment_name text,
      attachment_mime text,
      attachment_base64 text,
      created_at timestamptz not null default now(),
      read_at timestamptz,
      check(sender_account_id<>recipient_account_id),
      check(coalesce(length(trim(body)),0)>0 or attachment_base64 is not null)
    )`;
    await sql`create index if not exists pdm2_sender_recipient_idx
      on public.platform_direct_messages_v2(school_id,sender_account_id,recipient_account_id,created_at desc)`;
    await sql`create index if not exists pdm2_recipient_unread_idx
      on public.platform_direct_messages_v2(school_id,recipient_account_id,read_at,created_at desc)`;
    await sql`create table if not exists public.platform_group_messages_v2(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      group_id uuid not null references public.study_groups(id) on delete cascade,
      sender_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      body text,
      attachment_name text,
      attachment_mime text,
      attachment_base64 text,
      created_at timestamptz not null default now(),
      check(coalesce(length(trim(body)),0)>0 or attachment_base64 is not null)
    )`;
    await sql`create index if not exists pgm2_group_created_idx
      on public.platform_group_messages_v2(school_id,group_id,created_at)`;
    await sql`create table if not exists public.platform_parent_student_links(
      id uuid primary key default gen_random_uuid(),
      school_id uuid not null references public.schools(id) on delete cascade,
      parent_account_id uuid not null references public.platform_accounts(id) on delete cascade,
      student_id uuid not null references public.students(id) on delete cascade,
      relationship text,
      created_at timestamptz not null default now(),
      unique(parent_account_id,student_id)
    )`;
    await sql`create index if not exists ppsl_parent_idx
      on public.platform_parent_student_links(school_id,parent_account_id,created_at desc)`;
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
    await sql`alter table public.platform_certificates add column if not exists legacy_ref text`;
    await sql`create unique index if not exists platform_certificates_legacy_ref_uidx
      on public.platform_certificates(school_id,legacy_ref) where legacy_ref is not null`;
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
    await sql`alter table public.study_groups add column if not exists meeting_started_at timestamptz`;
    await sql`alter table public.study_groups add column if not exists meeting_ended_at timestamptz`;
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

async function directChatBaseContacts(a){
  const contacts=new Map();
  const add=(row,group,relation)=>{if(row?.account_id&&String(row.account_id)!==String(a.account_id))contacts.set(String(row.account_id),{...row,contact_group:group,relation_type:relation,profile_photo:null})};
  const assistant=await assistantLink(a);
  const privateStudent=(await sql`select id,teacher_account_id from public.teacher_private_students
    where platform_account_id=${a.account_id} and status='active' limit 1`)[0]||null;
  const privateParent=(await sql`select id,teacher_account_id from public.teacher_private_students
    where guardian_account_id=${a.account_id} and status='active' limit 1`)[0]||null;
  const effectiveType=assistant?'teacher_assistant':privateStudent?'private_student':privateParent?'private_parent':String(a.account_type||'');

  // School administration is available to teachers and students.
  if(['teacher','student','private_student','teacher_assistant','parent','private_parent'].includes(effectiveType)){
    const admins=await sql`select pa.id account_id,pa.display_name,pa.account_type,pa.account_code,pa.username,pa.internal_email,u.role
      from public.platform_accounts pa
      left join public.app_users u on u.id=pa.app_user_id
      where pa.school_id=${a.school_id} and pa.is_active=true
        and (pa.account_type='admin' or (pa.account_type='staff' and coalesce(u.role,'') in ('super_admin','school_manager','academic_admin','secretary','reception')))
      order by case when coalesce(u.role,'') in ('super_admin','school_manager') then 0 else 1 end,pa.display_name`;
    admins.forEach(x=>add(x,'الإدارة','administration'));
  }

  if(effectiveType==='teacher'){
    // ROVEN students assigned to this teacher.
    if(a.teacher_id){
      const schoolStudents=await sql`select distinct pa.id account_id,pa.display_name,pa.account_type,pa.account_code,pa.username,pa.internal_email,null::text role
        from public.courses c
        join public.study_groups g on g.course_id=c.id
        join public.enrollments en on en.group_id=g.id and en.status='active'
        join public.students st on st.id=en.student_id and st.status='active'
        join public.platform_accounts pa on pa.student_id=st.id and pa.is_active=true
        where c.teacher_id=${a.teacher_id} and c.school_id=${a.school_id}`;
      schoolStudents.forEach(x=>add(x,'طلاب المنصة','roven_student'));
    }
    // Private students owned by this teacher.
    const privateStudents=await sql`select pa.id account_id,pa.display_name,pa.account_type,pa.account_code,pa.username,pa.internal_email,null::text role
      from public.teacher_private_students ps
      join public.platform_accounts pa on pa.id=ps.platform_account_id and pa.is_active=true
      where ps.school_id=${a.school_id} and ps.teacher_account_id=${a.account_id} and ps.status='active'
      order by ps.full_name`;
    privateStudents.forEach(x=>add(x,'طلابي الخاصون','private_student'));
  }

  if(effectiveType==='student'&&a.student_id){
    const teachers=await sql`select distinct pa.id account_id,pa.display_name,pa.account_type,pa.account_code,pa.username,pa.internal_email,u.role
      from public.enrollments en
      join public.study_groups g on g.id=en.group_id
      join public.courses c on c.id=g.course_id
      join public.teachers t on t.id=c.teacher_id
      join public.platform_accounts pa on pa.teacher_id=t.id and pa.is_active=true
      left join public.app_users u on u.id=pa.app_user_id
      where en.student_id=${a.student_id} and en.status='active' and c.school_id=${a.school_id}`;
    teachers.forEach(x=>add(x,'معلموك','teacher'));
  }

  if(effectiveType==='private_student'){
    const owner=await sql`select pa.id account_id,pa.display_name,pa.account_type,pa.account_code,pa.username,pa.internal_email,u.role
      from public.platform_accounts pa
      left join public.app_users u on u.id=pa.app_user_id
      where pa.id=${privateStudent?.teacher_account_id||null} and pa.is_active=true limit 1`;
    owner.forEach(x=>add(x,'المعلم','teacher'));
  }

  if(effectiveType==='teacher_assistant'){
    const link=assistant;
    if(link){
      const teacher=await sql`select pa.id account_id,pa.display_name,pa.account_type,pa.account_code,pa.username,pa.internal_email,u.role
        from public.platform_accounts pa left join public.app_users u on u.id=pa.app_user_id
        where pa.id=${link.teacher_account_id} and pa.is_active=true limit 1`;
      teacher.forEach(x=>add(x,'المعلم','teacher'));
    }
  }

  // Admin/management can contact teachers directly.
  if(effectiveType==='admin'||(effectiveType==='staff'&&['super_admin','school_manager','academic_admin','secretary','reception'].includes(String(a.role||'')))){
    const teachers=await sql`select pa.id account_id,pa.display_name,pa.account_type,pa.account_code,pa.username,pa.internal_email,u.role
      from public.platform_accounts pa left join public.app_users u on u.id=pa.app_user_id
      where pa.school_id=${a.school_id} and pa.account_type='teacher' and pa.is_active=true
      order by pa.display_name`;
    teachers.forEach(x=>add(x,'المعلمون','teacher'));
  }
  return [...contacts.values()];
}
async function directChatPeerAllowed(a,peerId){
  return (await directChatBaseContacts(a)).some(x=>String(x.account_id)===String(peerId));
}

async function reconcileSinglePrivateRoomByAccount(accountId){
  const ps=(await sql`select id,teacher_account_id,group_id
    from public.teacher_private_students
    where platform_account_id=${accountId} and status='active'
    order by updated_at desc nulls last
    limit 1`)[0]||null;
  if(!ps)return null;

  const rooms=await sql`select trm.group_id,trm.teacher_account_id,trm.school_id,
      g.meeting_url,g.meeting_provider,g.name group_name
    from public.teacher_room_management trm
    join public.study_groups g on g.id=trm.group_id
    where trm.teacher_account_id=${ps.teacher_account_id}
      and trm.is_active=true
    order by trm.updated_at desc`;
  if(rooms.length!==1)return ps;

  const room=rooms[0];

  // If the contracted room has no meeting link, recover it from an old duplicate
  // group with the same name that belongs to the same teacher.
  if(!room.meeting_url){
    const teacher=(await sql`select teacher_id
      from public.platform_accounts
      where id=${ps.teacher_account_id}
      limit 1`)[0]||null;
    if(teacher?.teacher_id){
      const legacyMeeting=(await sql`select g.meeting_url,g.meeting_provider
        from public.study_groups g
        join public.courses c on c.id=g.course_id
        where c.teacher_id=${teacher.teacher_id}
          and g.id<>${room.group_id}
          and lower(trim(g.name))=lower(trim(${room.group_name}))
          and g.meeting_url is not null
          and length(trim(g.meeting_url))>0
        order by g.id
        limit 1`)[0]||null;
      if(legacyMeeting?.meeting_url){
        await sql`update public.study_groups
          set meeting_url=${legacyMeeting.meeting_url},
              meeting_provider=coalesce(${legacyMeeting.meeting_provider||null},meeting_provider)
          where id=${room.group_id}`;
      }
    }
  }

  if(String(ps.group_id||'')!==String(room.group_id)){
    // Preserve a meeting link that may have been saved on the exact old group id.
    const oldGroup=ps.group_id?(await sql`select meeting_url,meeting_provider
      from public.study_groups where id=${ps.group_id} limit 1`)[0]||null:null;
    const currentRoom=(await sql`select meeting_url from public.study_groups where id=${room.group_id}`)[0]||null;
    if(!currentRoom?.meeting_url && oldGroup?.meeting_url){
      await sql`update public.study_groups
        set meeting_url=${oldGroup.meeting_url},
            meeting_provider=coalesce(${oldGroup.meeting_provider||null},meeting_provider)
        where id=${room.group_id}`;
    }

    const updated=(await sql`update public.teacher_private_students
      set group_id=${room.group_id},updated_at=now()
      where id=${ps.id}
      returning id,teacher_account_id,group_id`)[0];
    return updated||ps;
  }
  return ps;
}

async function materializeLegacyPrivateStudentsForRoom(access){
  if(!access?.teacher_account_id)return 0;
  const aliases=Array.isArray(access.alias_group_ids)&&access.alias_group_ids.length
    ?access.alias_group_ids.map(String)
    :[String(access.canonical_group_id||access.group_id||access.requested_group_id||'')].filter(Boolean);
  if(!aliases.length)return 0;

  const canonicalId=String(access.canonical_group_id||access.group_id||aliases[0]);
  const room=(await sql`select g.name group_name
    from public.study_groups g
    where g.id=${canonicalId}::uuid
    limit 1`)[0]||null;
  const teacher=(await sql`select display_name
    from public.platform_accounts
    where id=${access.teacher_account_id}
    limit 1`)[0]||null;
  if(!room?.group_name)return 0;

  const candidates=await sql`select
      s.id student_id,
      s.student_no,
      s.full_name,
      coalesce(to_jsonb(s)->>'phone','') phone,
      coalesce(to_jsonb(s)->>'notes','') notes,
      pa.id platform_account_id,
      pa.account_code,
      pa.username
    from public.students s
    join public.platform_accounts pa
      on pa.student_id=s.id
     and pa.is_active=true
    where s.status='active'
      and (
        s.school_id=${access.school_id}
        or pa.school_id=${access.school_id}
      )
      and coalesce(to_jsonb(s)->>'notes','') ilike '%طالب خاص تابع للمعلم%'
      and coalesce(to_jsonb(s)->>'notes','') ilike ${'%'+String(room.group_name).trim()+'%'}
      and (
        ${String(teacher?.display_name||'')}=''
        or coalesce(to_jsonb(s)->>'notes','') ilike ${'%'+String(teacher?.display_name||'').trim()+'%'}
      )
      and not exists(
        select 1 from public.teacher_private_students ps
        where ps.platform_account_id=pa.id and ps.status='active'
      )`;

  let created=0;
  for(const st of candidates){
    let guardianAccountId=null,parentName=null,parentPhone=null;
    const direct=(await sql`select ppsl.parent_account_id
      from public.platform_parent_student_links ppsl
      where ppsl.student_id=${st.student_id}
      order by ppsl.created_at desc
      limit 1`)[0]||null;
    guardianAccountId=direct?.parent_account_id||null;

    if(!guardianAccountId){
      const rel=(await sql`select
          coalesce(to_jsonb(pr)->>'full_name','') parent_name,
          coalesce(to_jsonb(pr)->>'phone','') parent_phone,
          pa.id guardian_account_id
        from public.student_parents sp
        join public.parents pr on pr.id=sp.parent_id
        left join public.platform_accounts pa on pa.parent_id=pr.id and pa.is_active=true
        where sp.student_id=${st.student_id}
        limit 1`)[0]||null;
      guardianAccountId=rel?.guardian_account_id||null;
      parentName=rel?.parent_name||null;
      parentPhone=rel?.parent_phone||null;
    }

    const privateCode=String(st.account_code||st.student_no||st.username||('TPS-MIG-'+String(st.platform_account_id).slice(0,8))).slice(0,80);
    try{
      const ins=await sql`insert into public.teacher_private_students(
        school_id,teacher_account_id,group_id,platform_account_id,guardian_account_id,
        private_code,full_name,phone,parent_name,parent_phone,monthly_fee,books_fee,books_free,
        joined_on,notes,status,updated_at
      ) values(
        ${access.school_id},${access.teacher_account_id},${canonicalId}::uuid,${st.platform_account_id},${guardianAccountId},
        ${privateCode},${st.full_name},${st.phone||null},${parentName},${parentPhone},
        0,0,false,current_date,'ترحيل تلقائي من سجل الطالب القديم للقاعة الخاصة','active',now()
      )
      on conflict(teacher_account_id,private_code)
      do update set
        group_id=excluded.group_id,
        platform_account_id=excluded.platform_account_id,
        guardian_account_id=coalesce(excluded.guardian_account_id,teacher_private_students.guardian_account_id),
        full_name=excluded.full_name,
        phone=coalesce(excluded.phone,teacher_private_students.phone),
        status='active',
        updated_at=now()
      returning id`;
      if(ins.length)created++;
    }catch{}
  }
  return created;
}

async function materializeLegacyPrivateStudentFromMail(a,token,preferredGroupId=null){
  if(!a?.account_id||!token)return null;
  const existing=(await sql`select id,teacher_account_id,group_id,platform_account_id
    from public.teacher_private_students
    where platform_account_id=${a.account_id} and status='active'
    order by updated_at desc nulls last
    limit 1`)[0]||null;
  if(existing)return existing;
  if(String(a.account_type||'')!=='student')return null;

  let mails=[];
  try{
    const mailRpc=await sql`select public.roven_rpc(
      'platform_mail_list',
      ${token},
      ${JSON.stringify({p_folder:'inbox'})}::jsonb
    ) result`;
    mails=Array.isArray(mailRpc[0]?.result)?mailRpc[0].result:[];
  }catch{
    return null;
  }

  const links=mails
    .filter(m=>String(m?.subject||'').startsWith('[PRIVATE_STUDENT_LINK]'))
    .map(m=>{
      let body=m?.body;
      if(typeof body==='string'){
        try{body=JSON.parse(body)}catch{body={}}
      }
      return {...(body&&typeof body==='object'?body:{}),_sent_at:m?.sent_at||null};
    })
    .filter(x=>x.group_id||x.teacher_internal_email)
    .sort((x,y)=>{
      const px=preferredGroupId&&String(x.group_id)===String(preferredGroupId)?1:0;
      const py=preferredGroupId&&String(y.group_id)===String(preferredGroupId)?1:0;
      if(px!==py)return py-px;
      return new Date(y.linked_at||y._sent_at||0)-new Date(x.linked_at||x._sent_at||0);
    });

  const link=links[0]||null;
  if(!link)return null;

  let teacherAccount=null;
  if(link.teacher_internal_email){
    teacherAccount=(await sql`select id,school_id,display_name
      from public.platform_accounts
      where account_type='teacher'
        and is_active=true
        and lower(coalesce(internal_email,''))=lower(${String(link.teacher_internal_email)})
      order by updated_at desc nulls last
      limit 1`)[0]||null;
  }
  if(!teacherAccount&&link.group_id){
    teacherAccount=(await sql`select pa.id,pa.school_id,pa.display_name
      from public.teacher_room_management trm
      join public.platform_accounts pa on pa.id=trm.teacher_account_id
      where trm.group_id=${String(link.group_id)}::uuid
        and trm.is_active=true
        and pa.is_active=true
      limit 1`)[0]||null;
  }
  if(!teacherAccount&&link.group_id){
    teacherAccount=(await sql`select pa.id,pa.school_id,pa.display_name
      from public.study_groups g
      join public.courses c on c.id=g.course_id
      join public.platform_accounts pa
        on pa.teacher_id=c.teacher_id
       and pa.account_type='teacher'
       and pa.is_active=true
      where g.id=${String(link.group_id)}::uuid
      order by pa.updated_at desc nulls last
      limit 1`)[0]||null;
  }
  if(!teacherAccount)return null;

  const oldGroup=link.group_id?(await sql`select id,name
    from public.study_groups where id=${String(link.group_id)}::uuid limit 1`)[0]||null:null;
  const wantedName=String(link.group_name||oldGroup?.name||'').trim();

  let rooms=await sql`select trm.group_id,trm.school_id,trm.teacher_account_id,trm.updated_at,g.name group_name
    from public.teacher_room_management trm
    join public.study_groups g on g.id=trm.group_id
    where trm.teacher_account_id=${teacherAccount.id}
      and trm.is_active=true
    order by trm.updated_at desc nulls last`;

  let room=rooms.find(x=>String(x.group_id)===String(link.group_id||preferredGroupId||''))||null;
  if(!room&&preferredGroupId)room=rooms.find(x=>String(x.group_id)===String(preferredGroupId))||null;
  if(!room&&wantedName)room=rooms.find(x=>String(x.group_name||'').trim().toLowerCase()===wantedName.toLowerCase())||null;
  if(!room&&rooms.length===1)room=rooms[0];
  if(!room)return null;

  const account=(await sql`select account_code,username,display_name,student_id
    from public.platform_accounts where id=${a.account_id} limit 1`)[0]||{};
  const schoolStudent=a.student_id?(await sql`select full_name,phone
    from public.students where id=${a.student_id} limit 1`)[0]||null:null;

  let parentName=null,parentPhone=null,guardianAccountId=null;
  if(a.student_id){
    const parent=(await sql`select pr.id parent_id,
        coalesce(to_jsonb(pr)->>'full_name','') full_name,
        coalesce(to_jsonb(pr)->>'phone','') phone,
        pa.id guardian_account_id
      from public.student_parents sp
      join public.parents pr on pr.id=sp.parent_id
      left join public.platform_accounts pa
        on pa.parent_id=pr.id and pa.is_active=true
      where sp.student_id=${a.student_id}
      limit 1`)[0]||null;
    if(parent){
      parentName=parent.full_name||null;
      parentPhone=parent.phone||null;
      guardianAccountId=parent.guardian_account_id||null;
    }
  }

  const privateCode=String(account.account_code||account.username||('TPS-MIG-'+String(a.account_id).slice(0,8))).slice(0,80);
  try{
    return (await sql`insert into public.teacher_private_students(
      school_id,teacher_account_id,group_id,platform_account_id,guardian_account_id,
      private_code,full_name,phone,parent_name,parent_phone,monthly_fee,books_fee,books_free,joined_on,notes,status,updated_at
    ) values(
      ${room.school_id||teacherAccount.school_id},${teacherAccount.id},${room.group_id},
      ${a.account_id},${guardianAccountId},
      ${privateCode},${schoolStudent?.full_name||account.display_name||a.display_name||'طالب'},
      ${schoolStudent?.phone||null},${parentName},${parentPhone},
      0,0,false,current_date,'ترحيل تلقائي من PRIVATE_STUDENT_LINK','active',now()
    )
    on conflict(teacher_account_id,private_code)
    do update set
      group_id=excluded.group_id,
      platform_account_id=excluded.platform_account_id,
      guardian_account_id=coalesce(excluded.guardian_account_id,teacher_private_students.guardian_account_id),
      full_name=excluded.full_name,
      phone=coalesce(excluded.phone,teacher_private_students.phone),
      parent_name=coalesce(excluded.parent_name,teacher_private_students.parent_name),
      parent_phone=coalesce(excluded.parent_phone,teacher_private_students.parent_phone),
      status='active',
      updated_at=now()
    returning id,teacher_account_id,group_id,platform_account_id`)[0]||null;
  }catch{
    const byAccount=(await sql`select id,teacher_account_id,group_id,platform_account_id
      from public.teacher_private_students
      where platform_account_id=${a.account_id} and status='active'
      limit 1`)[0]||null;
    return byAccount;
  }
}

async function privateRoomAccess(a,groupId,requireChat=false){
  const gid=String(groupId||'');
  if(!gid)return null;

  let room=(await sql`select
      trm.group_id,trm.school_id,trm.teacher_account_id,
      g.name group_name,trm.updated_at
    from public.teacher_room_management trm
    join public.study_groups g on g.id=trm.group_id
    where trm.group_id=${gid}::uuid
      and trm.is_active=true
    limit 1`)[0]||null;

  // Legacy/ordinary group id: resolve it to the teacher's managed private room
  // with the same normalized name.
  if(!room){
    const legacy=(await sql`select
        g.id,g.name group_name,g.school_id,c.teacher_id
      from public.study_groups g
      left join public.courses c on c.id=g.course_id
      where g.id=${gid}::uuid
      limit 1`)[0]||null;

    if(legacy){
      let teacherAccountId=null;

      if(a.account_type==='teacher'){
        teacherAccountId=a.account_id;
      }else if(legacy.teacher_id){
        const pa=(await sql`select id
          from public.platform_accounts
          where teacher_id=${legacy.teacher_id}
            and account_type='teacher'
            and is_active=true
          order by updated_at desc nulls last
          limit 1`)[0]||null;
        teacherAccountId=pa?.id||null;
      }

      if(!teacherAccountId&&['student','private_student'].includes(String(a.account_type||''))){
        const ps=(await sql`select teacher_account_id
          from public.teacher_private_students
          where platform_account_id=${a.account_id}
            and status='active'
          order by updated_at desc nulls last
          limit 1`)[0]||null;
        teacherAccountId=ps?.teacher_account_id||null;
      }

      if(teacherAccountId){
        room=(await sql`select
            trm.group_id,trm.school_id,trm.teacher_account_id,
            g.name group_name,trm.updated_at
          from public.teacher_room_management trm
          join public.study_groups g on g.id=trm.group_id
          where trm.teacher_account_id=${teacherAccountId}
            and trm.is_active=true
            and lower(trim(g.name))=lower(trim(${legacy.group_name}))
          order by trm.updated_at desc nulls last
          limit 1`)[0]||null;
      }
    }
  }

  if(!room)return null;

  // Treat duplicate active contracts with the same teacher + normalized room name
  // as one logical private room.
  const cluster=await sql`select
      trm.group_id,trm.school_id,trm.teacher_account_id,trm.updated_at,
      g.name group_name,
      coalesce((select count(*) from public.teacher_private_students ps
        where ps.teacher_account_id=trm.teacher_account_id
          and ps.group_id=trm.group_id
          and ps.status='active'),0)::int student_count
    from public.teacher_room_management trm
    join public.study_groups g on g.id=trm.group_id
    where trm.teacher_account_id=${room.teacher_account_id}
      and trm.is_active=true
      and lower(trim(g.name))=lower(trim(${room.group_name}))
    order by student_count desc,trm.updated_at desc nulls last,trm.group_id`;

  const aliases=(cluster.length?cluster:[room]).map(x=>String(x.group_id));
  const canonical=(cluster[0]||room);
  const logicalRoom={
    ...room,
    group_id:canonical.group_id,
    canonical_group_id:canonical.group_id,
    requested_group_id:gid,
    alias_group_ids:aliases,
    school_id:canonical.school_id||room.school_id
  };

  // The room owner is authoritative even if they opened a legacy duplicate id.
  if(String(room.teacher_account_id)===String(a.account_id))return logicalRoom;

  await reconcileSinglePrivateRoomByAccount(a.account_id);

  // A private student belongs to the logical room if their row points to any
  // duplicate id in the same teacher/name cluster.
  const privateStudent=(await sql`select 1
    from public.teacher_private_students ps
    where ps.group_id=any(${aliases}::uuid[])
      and ps.teacher_account_id=${room.teacher_account_id}
      and ps.platform_account_id=${a.account_id}
      and ps.status='active'
    limit 1`)[0];
  if(privateStudent)return logicalRoom;

  // Ordinary school membership remains school-scoped, but accept aliases.
  if(a.student_id && String(room.school_id)===String(a.school_id)){
    const enrolled=(await sql`select 1 from public.enrollments
      where group_id=any(${aliases}::uuid[]) and student_id=${a.student_id} and status='active'
      limit 1`)[0];
    if(enrolled)return logicalRoom;
  }

  const link=await assistantLink(a);
  if(link && String(link.teacher_account_id)===String(room.teacher_account_id)){
    if(requireChat && !Boolean(link.permissions?.chat))return null;
    const groups=(await delegatedGroups(link.id)).map(x=>String(x.group_id));
    if(aliases.some(x=>groups.includes(x)))return logicalRoom;
  }

  if(String(room.school_id)===String(a.school_id) &&
     (a.account_type==='admin' || (a.account_type==='staff' && ['super_admin','school_manager','academic_admin'].includes(String(a.role||'')))))return logicalRoom;
  return null;
}

async function guardianByPhone(schoolId,rawPhone,preferredAccountId=null){
  const digits=String(rawPhone||'').replace(/\D/g,'').replace(/^00/,'');
  if(!digits)return null;

  const rows=await sql`select distinct pa.id,pa.username,pa.account_code,pa.internal_email,pa.display_name,pa.parent_id,pa.created_at
    from public.platform_accounts pa
    left join public.parents pr on pr.id=pa.parent_id
    where pa.school_id=${schoolId}
      and pa.account_type='parent'
      and pa.is_active=true
      and (
        regexp_replace(regexp_replace(coalesce(to_jsonb(pr)->>'phone',''),'\\D','','g'),'^00','')=${digits}
        or exists(
          select 1 from public.teacher_private_students ps
          where ps.guardian_account_id=pa.id
            and ps.school_id=${schoolId}
            and regexp_replace(regexp_replace(coalesce(ps.parent_phone,''),'\\D','','g'),'^00','')=${digits}
        )
      )
    order by pa.created_at asc nulls last`;

  if(!rows.length)return null;
  const preferred=preferredAccountId?rows.find(x=>String(x.id)===String(preferredAccountId)):null;
  return preferred||rows[0];
}

async function unifyGuardianPhoneLinks(schoolId,rawPhone,preferredAccountId=null){
  const digits=String(rawPhone||'').replace(/\D/g,'').replace(/^00/,'');
  if(!digits)return null;

  let guardian=await guardianByPhone(schoolId,rawPhone,preferredAccountId);
  if(!guardian)return null;

  const matchingAccounts=await sql`select distinct pa.id,pa.parent_id
    from public.platform_accounts pa
    left join public.parents pr on pr.id=pa.parent_id
    where pa.school_id=${schoolId}
      and pa.account_type='parent'
      and pa.is_active=true
      and (
        regexp_replace(regexp_replace(coalesce(to_jsonb(pr)->>'phone',''),'\\D','','g'),'^00','')=${digits}
        or exists(
          select 1 from public.teacher_private_students ps
          where ps.guardian_account_id=pa.id
            and ps.school_id=${schoolId}
            and regexp_replace(regexp_replace(coalesce(ps.parent_phone,''),'\\D','','g'),'^00','')=${digits}
        )
      )`;

  const accountIds=matchingAccounts.map(x=>x.id);
  const parentIds=matchingAccounts.map(x=>x.parent_id).filter(Boolean);

  await sql`update public.teacher_private_students
    set guardian_account_id=${guardian.id},updated_at=now()
    where school_id=${schoolId}
      and status='active'
      and regexp_replace(regexp_replace(coalesce(parent_phone,''),'\\D','','g'),'^00','')=${digits}
      and guardian_account_id is distinct from ${guardian.id}`;

  if(accountIds.length){
    const directLinks=await sql`select distinct student_id,coalesce(relationship,'guardian') relationship
      from public.platform_parent_student_links
      where school_id=${schoolId}
        and parent_account_id=any(${accountIds}::uuid[])`;
    for(const link of directLinks){
      await sql`insert into public.platform_parent_student_links(
        school_id,parent_account_id,student_id,relationship
      ) values(${schoolId},${guardian.id},${link.student_id},${link.relationship})
      on conflict(parent_account_id,student_id)
      do update set relationship=excluded.relationship`;
    }
  }

  if(parentIds.length){
    const familyStudents=await sql`select distinct sp.student_id
      from public.student_parents sp
      join public.students s on s.id=sp.student_id
      where sp.parent_id=any(${parentIds}::uuid[])
        and s.school_id=${schoolId}`;
    for(const row of familyStudents){
      await sql`insert into public.platform_parent_student_links(
        school_id,parent_account_id,student_id,relationship
      ) values(${schoolId},${guardian.id},${row.student_id},'guardian')
      on conflict(parent_account_id,student_id) do nothing`;
    }
  }

  return guardian;
}

async function cleanupCertificateMigrationDuplicates(schoolId){
  await sql`update public.platform_certificates dup
    set revoked_at=coalesce(dup.revoked_at,now())
    from public.platform_certificates original
    where dup.school_id=${schoolId}
      and original.school_id=dup.school_id
      and dup.id<>original.id
      and dup.revoked_at is null
      and dup.legacy_ref=original.id::text`;
}

async function custom(action,a,p){
  await ensureSchema();

  if(action==='platform_attendance_groups_local'){
    if(a.account_type==='teacher'){
      const privateGroups=await sql`select distinct
          trm.group_id,
          g.name group_name,
          coalesce(t.full_name,${a.display_name||null}) teacher_name,
          null::text grade_name,
          0 sort_order
        from public.teacher_room_management trm
        join public.study_groups g on g.id=trm.group_id
        left join public.courses c on c.id=g.course_id
        left join public.teachers t on t.id=c.teacher_id
        where trm.teacher_account_id=${a.account_id}
          and trm.is_active=true
          and coalesce(g.is_active,true)=true`;

      const normalGroups=a.teacher_id?await sql`select distinct
          g.id group_id,
          g.name group_name,
          coalesce(t.full_name,${a.display_name||null}) teacher_name,
          null::text grade_name,
          1 sort_order
        from public.study_groups g
        join public.courses c on c.id=g.course_id
        left join public.teachers t on t.id=c.teacher_id
        where c.teacher_id=${a.teacher_id}
          and coalesce(g.is_active,true)=true`:[];
      const merged=new Map();
      for(const row of [...privateGroups,...normalGroups]){
        const key=String(row.group_name||row.group_id||'').trim().toLowerCase();
        if(!merged.has(key))merged.set(key,row);
      }
      return [...merged.values()].sort((x,y)=>Number(x.sort_order)-Number(y.sort_order)||String(x.group_name).localeCompare(String(y.group_name),'ar'));
    }
    const rows=await sql`select public.roven_rpc('platform_attendance_groups',${p.p_token||null},'{}'::jsonb) result`;
    return rows[0]?.result??[];
  }

  if(action==='platform_direct_chat_contacts'){
    const contacts=await directChatBaseContacts(a);
    const msgs=await sql`select id,sender_account_id,recipient_account_id,body,attachment_name,created_at,read_at
      from public.platform_direct_messages_v2
      where school_id=${a.school_id} and (sender_account_id=${a.account_id} or recipient_account_id=${a.account_id})
      order by created_at desc limit 2000`;
    return contacts.map(c=>{
      const rel=msgs.filter(m=>(String(m.sender_account_id)===String(a.account_id)&&String(m.recipient_account_id)===String(c.account_id))||
                               (String(m.recipient_account_id)===String(a.account_id)&&String(m.sender_account_id)===String(c.account_id)));
      const last=rel[0]||null;
      return {...c,last_message:last?.body|| (last?.attachment_name?'ملف مرفق':''),
        last_at:last?.created_at||null,
        unread_count:rel.filter(m=>String(m.recipient_account_id)===String(a.account_id)&&!m.read_at).length};
    }).sort((x,y)=>{
      if(x.last_at||y.last_at)return new Date(y.last_at||0)-new Date(x.last_at||0);
      return String(x.contact_group||'').localeCompare(String(y.contact_group||''),'ar')||String(x.display_name||'').localeCompare(String(y.display_name||''),'ar');
    });
  }

  if(action==='platform_direct_chat_list'){
    const peer=String(p.p_peer_id||'');
    if(!peer||!(await directChatPeerAllowed(a,peer)))throw new Error('chat_peer_not_allowed');
    await sql`update public.platform_direct_messages_v2
      set read_at=coalesce(read_at,now())
      where school_id=${a.school_id} and sender_account_id=${peer}::uuid and recipient_account_id=${a.account_id} and read_at is null`;
    return await sql`select m.id message_id,m.sender_account_id,m.recipient_account_id,m.body,
      m.attachment_name,m.attachment_mime,m.attachment_base64,m.created_at,m.read_at,
      pa.display_name sender_name,null::text sender_photo
      from public.platform_direct_messages_v2 m
      join public.platform_accounts pa on pa.id=m.sender_account_id
      where m.school_id=${a.school_id}
        and ((m.sender_account_id=${a.account_id} and m.recipient_account_id=${peer}::uuid)
          or (m.sender_account_id=${peer}::uuid and m.recipient_account_id=${a.account_id}))
      order by m.created_at asc`;
  }

  if(action==='platform_direct_chat_send'){
    const peer=String(p.p_peer_id||'');
    if(!peer||!(await directChatPeerAllowed(a,peer)))throw new Error('chat_peer_not_allowed');
    const body=String(p.p_body||'').trim();
    const attachment=String(p.p_attachment_base64||'')||null;
    if(!body&&!attachment)throw new Error('empty_message');
    return (await sql`insert into public.platform_direct_messages_v2(
      school_id,sender_account_id,recipient_account_id,body,attachment_name,attachment_mime,attachment_base64
    ) values(
      ${a.school_id},${a.account_id},${peer}::uuid,${body||null},${p.p_attachment_name||null},
      ${p.p_attachment_mime||null},${attachment}
    ) returning id message_id,sender_account_id,recipient_account_id,body,attachment_name,attachment_mime,created_at,read_at`)[0];
  }

  if(action==='platform_group_chat_list_v2'){
    const gid=String(p.p_group_id||'');
    const access=await privateRoomAccess(a,gid,true);
    if(!access)throw new Error('group_access_denied');
    if(String(access.teacher_account_id)===String(a.account_id)){
      await materializeLegacyPrivateStudentsForRoom(access);
    }
    return await sql`select
      m.id message_id,m.sender_account_id,m.body,
      m.attachment_name,m.attachment_mime,m.attachment_base64,m.created_at,
      pa.display_name sender_name,null::text sender_photo
      from public.platform_group_messages_v2 m
      join public.platform_accounts pa on pa.id=m.sender_account_id
      where m.group_id=any(${access.alias_group_ids||[gid]}::uuid[])
      order by m.created_at asc`;
  }

  if(action==='platform_group_chat_send_v2'){
    const gid=String(p.p_group_id||'');
    const access=await privateRoomAccess(a,gid,true);
    if(!access)throw new Error('group_access_denied');
    const body=String(p.p_body||'').trim();
    const attachment=String(p.p_attachment_base64||'')||null;
    if(!body&&!attachment)throw new Error('empty_message');
    return (await sql`insert into public.platform_group_messages_v2(
      school_id,group_id,sender_account_id,body,attachment_name,attachment_mime,attachment_base64
    ) values(
      ${access.school_id},${access.canonical_group_id||gid}::uuid,${a.account_id},${body||null},
      ${p.p_attachment_name||null},${p.p_attachment_mime||null},${attachment}
    )
    returning id message_id,sender_account_id,body,attachment_name,attachment_mime,created_at`)[0];
  }

  if(action==='private_room_attendance_roster'){
    const gid=String(p.p_group_id||'');
    const onDate=String(p.p_on_date||new Date().toISOString().slice(0,10));
    const access=await privateRoomAccess(a,gid,false);
    if(!access)throw new Error('group_access_denied');

    await materializeLegacyPrivateStudentsForRoom(access);

    return await sql`select
      ps.id student_id,
      ps.private_code student_no,
      ps.full_name student_name,
      coalesce(att.status,'present') status,
      coalesce(att.minutes_late,0)::int minutes_late,
      coalesce(att.note,'') note,
      true is_private_student
      from public.teacher_private_students ps
      left join public.teacher_private_attendance att
        on att.private_student_id=ps.id
       and att.group_id=any(${access.alias_group_ids||[gid]}::uuid[])
       and att.attendance_date=${onDate}::date
      where ps.group_id=any(${access.alias_group_ids||[gid]}::uuid[])
        and ps.teacher_account_id=${access.teacher_account_id}
        and ps.status='active'
      order by ps.full_name`;
  }

  if(action==='private_room_attendance_save'){
    const gid=String(p.p_group_id||'');
    const onDate=String(p.p_on_date||'');
    if(!gid||!onDate)throw new Error('group_and_date_required');
    const access=await privateRoomAccess(a,gid,false);
    if(!access)throw new Error('group_access_denied');

    const link=await assistantLink(a);
    const isTeacher=String(access.teacher_account_id)===String(a.account_id);
    const canAssistant=Boolean(link && String(link.teacher_account_id)===String(access.teacher_account_id) && link.permissions?.attendance);
    if(!isTeacher&&!canAssistant&&a.account_type!=='admin'&&a.account_type!=='staff')throw new Error('attendance_access_denied');

    let saved=0,present=0,absent=0,late=0,excused=0,leftEarly=0;
    for(const r of (Array.isArray(p.p_records)?p.p_records:[])){
      const sid=String(r.student_id||'');
      const ps=(await sql`select id
        from public.teacher_private_students
        where id=${sid}::uuid
          and group_id=any(${access.alias_group_ids||[gid]}::uuid[])
          and teacher_account_id=${access.teacher_account_id}
          and status='active'
        limit 1`)[0];
      if(!ps)continue;

      const status=['present','absent','late','excused','left_early'].includes(String(r.status||''))?String(r.status):'present';
      const mins=Math.max(0,Number(r.minutes_late||0)||0);
      await sql`insert into public.teacher_private_attendance(
        school_id,teacher_account_id,group_id,private_student_id,attendance_date,status,
        minutes_late,note,recorded_by_account_id,recorded_at
      ) values(
        ${access.school_id},${access.teacher_account_id},${access.canonical_group_id||gid}::uuid,${sid}::uuid,${onDate}::date,${status},
        ${mins},${r.note||null},${a.account_id},now()
      )
      on conflict(group_id,private_student_id,attendance_date)
      do update set
        status=excluded.status,
        minutes_late=excluded.minutes_late,
        note=excluded.note,
        recorded_by_account_id=excluded.recorded_by_account_id,
        recorded_at=now()`;

      saved++;
      if(status==='present')present++;
      else if(status==='absent')absent++;
      else if(status==='late')late++;
      else if(status==='excused')excused++;
      else if(status==='left_early')leftEarly++;
    }
    return {saved,present,absent,late,excused,left_early:leftEarly};
  }

  if(action==='teacher_room_contract_set'){
    must(a,a.account_type==='admin'||['super_admin','school_manager'].includes(String(a.role||'')));
    const gid=String(p.p_group_id||''),teacherId=String(p.p_teacher_id||'');
    if(!gid||!teacherId)throw new Error('group_and_teacher_required');
    const teacherAccount=(await sql`select id from public.platform_accounts
      where school_id=${a.school_id} and teacher_id=${teacherId}::uuid and is_active=true limit 1`)[0];
    if(!teacherAccount)throw new Error('teacher_account_not_found');
    const capacity=p.p_capacity?Math.max(1,Number(p.p_capacity)):null;
    const row=(await sql`insert into public.teacher_room_management(
      group_id,school_id,teacher_account_id,management_mode,service_fee,fee_basis,
      capacity,agreed_price,pricing_basis,is_active,updated_at
    ) values(
      ${gid}::uuid,${a.school_id},${teacherAccount.id},
      ${p.p_management_mode||'teacher'},${Number(p.p_management_fee||0)},
      ${p.p_management_fee_basis||'monthly'},${capacity},
      ${Number(p.p_agreed_price||0)},${p.p_pricing_basis||'monthly'},true,now()
    ) on conflict(group_id) do update set
      teacher_account_id=excluded.teacher_account_id,
      management_mode=excluded.management_mode,
      service_fee=excluded.service_fee,
      fee_basis=excluded.fee_basis,
      capacity=excluded.capacity,
      agreed_price=excluded.agreed_price,
      pricing_basis=excluded.pricing_basis,
      is_active=true,updated_at=now()
    returning *`)[0];
    return row;
  }

  if(action==='teacher_room_contracts_list'){
    const link=await assistantLink(a);
    const teacherAccountId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherAccountId);
    let groupIds=null;
    if(link)groupIds=(await delegatedGroups(link.id)).map(x=>String(x.group_id));
    const rows=await sql`select trm.group_id,g.name group_name,coalesce(to_jsonb(c)->>'subject_name',to_jsonb(c)->>'name',to_jsonb(c)->>'title',to_jsonb(c)->>'subject') subject_name,g.schedule_json,g.meeting_url,g.meeting_provider,
      trm.capacity,trm.agreed_price,trm.pricing_basis,trm.management_mode,trm.service_fee,trm.fee_basis,trm.is_active,
      coalesce((select count(*) from public.teacher_private_students ps
        where ps.group_id=trm.group_id and ps.teacher_account_id=trm.teacher_account_id and ps.status='active'),0)::int current_private_students
      from public.teacher_room_management trm
      join public.study_groups g on g.id=trm.group_id
      left join public.courses c on c.id=g.course_id
      where trm.school_id=${a.school_id} and trm.teacher_account_id=${teacherAccountId} and trm.is_active=true
      order by g.name`;
    return groupIds?rows.filter(x=>groupIds.includes(String(x.group_id))):rows;
  }

  if(action==='admin_teacher_room_finance'){
    const allowed=a.account_type==='admin'||(a.account_type==='staff'&&['finance_admin','school_manager','secretary'].includes(String(a.role||'')));
    must(a,allowed);
    const period=/^\d{4}-\d{2}$/.test(String(p.p_period||''))?String(p.p_period):new Date().toISOString().slice(0,7);
    const periodStart=period+'-01';

    const rows=await sql`select
      trm.group_id,trm.teacher_account_id,trm.capacity,trm.agreed_price,trm.pricing_basis,
      trm.management_mode,trm.service_fee,trm.fee_basis,trm.is_active,
      g.name group_name,
      pa.display_name teacher_name,pa.internal_email teacher_internal_email,pa.username teacher_username,
      coalesce((select count(*) from public.teacher_private_students ps
        where ps.group_id=trm.group_id and ps.teacher_account_id=trm.teacher_account_id and ps.status='active'),0)::int current_private_students,
      coalesce((select count(distinct att.attendance_date) from public.teacher_private_attendance att
        where att.group_id=trm.group_id
          and att.attendance_date>=${periodStart}::date
          and att.attendance_date<(${periodStart}::date+interval '1 month')),0)::int session_count,
      coalesce((select sum(fp.amount) from public.teacher_room_fee_payments fp
        where fp.group_id=trm.group_id
          and fp.teacher_account_id=trm.teacher_account_id
          and fp.billing_period=${period}
          and fp.voided_at is null),0)::numeric period_paid
      from public.teacher_room_management trm
      join public.study_groups g on g.id=trm.group_id
      join public.platform_accounts pa on pa.id=trm.teacher_account_id
      where trm.school_id=${a.school_id} and trm.is_active=true
      order by pa.display_name,g.name`;

    const rooms=rows.map(r=>{
      const price=Number(r.agreed_price||0);
      const basis=String(r.pricing_basis||'monthly');
      const due=basis==='per_student'
        ? price*Number(r.current_private_students||0)
        : basis==='per_session'
          ? price*Number(r.session_count||0)
          : price;
      const paid=Number(r.period_paid||0);
      return {...r,period,due,period_paid:paid,balance:Math.max(0,due-paid)};
    });

    const payments=await sql`select
      fp.id payment_id,fp.billing_period,fp.amount,fp.paid_on,fp.method,fp.note,fp.receipt_no,
      fp.created_at,fp.voided_at,fp.void_reason,
      fp.group_id,fp.teacher_account_id,
      g.name group_name,pa.display_name teacher_name,pa.internal_email teacher_internal_email,
      recorder.display_name recorded_by_name
      from public.teacher_room_fee_payments fp
      join public.study_groups g on g.id=fp.group_id
      join public.platform_accounts pa on pa.id=fp.teacher_account_id
      left join public.platform_accounts recorder on recorder.id=fp.recorded_by_account_id
      where fp.school_id=${a.school_id}
      order by fp.created_at desc
      limit 200`;

    return {period,rooms,payments};
  }

  if(action==='admin_teacher_room_payment_add'){
    const allowed=a.account_type==='admin'||(a.account_type==='staff'&&['finance_admin','school_manager','secretary'].includes(String(a.role||'')));
    must(a,allowed);
    const gid=String(p.p_group_id||'');
    const amount=Number(p.p_amount||0);
    const period=/^\d{4}-\d{2}$/.test(String(p.p_period||''))?String(p.p_period):new Date().toISOString().slice(0,7);
    if(!gid)throw new Error('group_id_required');
    if(!(amount>0))throw new Error('invalid_amount');

    const room=(await sql`select trm.group_id,trm.teacher_account_id,trm.agreed_price,trm.pricing_basis,
      g.name group_name,pa.display_name teacher_name,pa.internal_email teacher_internal_email
      from public.teacher_room_management trm
      join public.study_groups g on g.id=trm.group_id
      join public.platform_accounts pa on pa.id=trm.teacher_account_id
      where trm.group_id=${gid}::uuid and trm.school_id=${a.school_id} and trm.is_active=true
      limit 1`)[0];
    if(!room)throw new Error('teacher_room_not_found');

    const receiptNo='ROV-TR-'+Date.now().toString(36).toUpperCase();
    const payment=(await sql`insert into public.teacher_room_fee_payments(
      school_id,teacher_account_id,group_id,billing_period,amount,paid_on,method,note,receipt_no,recorded_by_account_id
    ) values(
      ${a.school_id},${room.teacher_account_id},${room.group_id},${period},${amount},
      ${p.p_date||new Date().toISOString().slice(0,10)}::date,${p.p_method||'cash'},
      ${p.p_note||null},${receiptNo},${a.account_id}
    ) returning *`)[0];

    const periodStart=period+'-01';
    const counts=(await sql`select
      coalesce((select count(*) from public.teacher_private_students ps
        where ps.group_id=${room.group_id} and ps.teacher_account_id=${room.teacher_account_id} and ps.status='active'),0)::int student_count,
      coalesce((select count(distinct att.attendance_date) from public.teacher_private_attendance att
        where att.group_id=${room.group_id}
          and att.attendance_date>=${periodStart}::date
          and att.attendance_date<(${periodStart}::date+interval '1 month')),0)::int session_count,
      coalesce((select sum(fp.amount) from public.teacher_room_fee_payments fp
        where fp.group_id=${room.group_id} and fp.teacher_account_id=${room.teacher_account_id}
          and fp.billing_period=${period} and fp.voided_at is null),0)::numeric total_paid`)[0];

    const price=Number(room.agreed_price||0);
    const basis=String(room.pricing_basis||'monthly');
    const due=basis==='per_student'?price*Number(counts.student_count||0)
      :basis==='per_session'?price*Number(counts.session_count||0)
      :price;
    const totalPaid=Number(counts.total_paid||0);

    return {
      ...payment,
      payment_id:payment.id,
      teacher_name:room.teacher_name,
      teacher_internal_email:room.teacher_internal_email,
      group_name:room.group_name,
      agreed_price:Number(room.agreed_price||0),
      pricing_basis:room.pricing_basis,
      due,total_paid:totalPaid,balance:Math.max(0,due-totalPaid)
    };
  }

  if(action==='admin_teacher_room_payment_void'){
    const allowed=a.account_type==='admin'||(a.account_type==='staff'&&['finance_admin','school_manager','secretary'].includes(String(a.role||'')));
    must(a,allowed);
    const pid=String(p.p_payment_id||'');
    if(!pid)throw new Error('payment_id_required');
    const rr=await sql`update public.teacher_room_fee_payments
      set voided_at=coalesce(voided_at,now()),
          voided_by_account_id=coalesce(voided_by_account_id,${a.account_id}),
          void_reason=coalesce(void_reason,${p.p_reason||'إلغاء بواسطة الإدارة'})
      where id=${pid}::uuid and school_id=${a.school_id}
      returning id payment_id,receipt_no,group_id,teacher_account_id,amount,billing_period,voided_at`;
    if(!rr.length)throw new Error('room_payment_not_found');
    return {...rr[0],voided:true};
  }

  if(action==='teacher_private_students_list'){
    const link=await assistantLink(a);
    const teacherId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherId && (a.account_type==='teacher'||Boolean(link?.permissions?.students)));
    let groupIds=null;
    if(link)groupIds=(await delegatedGroups(link.id)).map(x=>String(x.group_id));
    const rows=await sql`select ps.*,g.name group_name,trm.capacity room_capacity,
      spa.internal_email student_internal_email,
      gpa.internal_email parent_internal_email,
      coalesce((select count(*) from public.teacher_private_students ps2 where ps2.group_id=ps.group_id and ps2.teacher_account_id=ps.teacher_account_id and ps2.status='active'),0)::int room_students_count,
      coalesce((select sum(pp.amount) from public.teacher_private_payments pp
        where pp.private_student_id=ps.id and coalesce(pp.payment_kind,'tuition')='tuition'
          and date_trunc('month',pp.paid_on)=date_trunc('month',current_date)),0) month_paid,
      coalesce((select sum(pp.amount) from public.teacher_private_payments pp
        where pp.private_student_id=ps.id and pp.payment_kind='books'),0) books_paid
      from public.teacher_private_students ps
      left join public.platform_accounts spa on spa.id=ps.platform_account_id and spa.is_active=true
      left join public.platform_accounts gpa on gpa.id=ps.guardian_account_id and gpa.is_active=true
      left join public.study_groups g on g.id=ps.group_id
      left join public.teacher_room_management trm on trm.group_id=ps.group_id and trm.teacher_account_id=ps.teacher_account_id
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
    let contract=(await sql`select capacity from public.teacher_room_management
      where group_id=${gid}::uuid and teacher_account_id=${teacherId} and is_active=true limit 1`)[0];

    if(!contract){
      const owned=(await sql`select g.id
        from public.study_groups g
        join public.courses c on c.id=g.course_id
        join public.platform_accounts pa on pa.id=${teacherId}
        where g.id=${gid}::uuid
          and g.school_id=${a.school_id}
          and pa.teacher_id is not null
          and c.teacher_id=pa.teacher_id
        limit 1`)[0];

      if(!owned)throw new Error('private_group_required');

      contract=(await sql`insert into public.teacher_room_management(
          group_id,school_id,teacher_account_id,management_mode,service_fee,fee_basis,
          capacity,agreed_price,pricing_basis,is_active,updated_at
        ) values(
          ${gid}::uuid,${a.school_id},${teacherId},'teacher',0,'monthly',
          null,0,'monthly',true,now()
        )
        on conflict(group_id) do update set
          teacher_account_id=excluded.teacher_account_id,
          is_active=true,
          updated_at=now()
        returning capacity`)[0];
    }

    const fullName=String(p.p_full_name||'').trim();
    if(!fullName)throw new Error('student_name_required');
    const existingId=String(p.p_private_student_id||'');
    const currentCount=Number((await sql`select count(*)::int n from public.teacher_private_students
      where group_id=${gid}::uuid and teacher_account_id=${teacherId} and status='active'
        and (${existingId||null}::text is null or id::text<>${existingId||null})`)[0]?.n||0);
    if(contract.capacity&&currentCount>=Number(contract.capacity))throw new Error('room_capacity_reached');

    if(existingId){
      let guardian=null;
      if(String(p.p_parent_phone||'').trim()){
        guardian=await unifyGuardianPhoneLinks(a.school_id,p.p_parent_phone,null);
      }
      const rr=await sql`update public.teacher_private_students
        set full_name=${fullName},phone=${p.p_phone||null},parent_name=${p.p_parent_name||null},
            parent_phone=${p.p_parent_phone||null},
            guardian_account_id=coalesce(${guardian?.id||null}::uuid,guardian_account_id),
            monthly_fee=${Number(p.p_monthly_fee||0)},
            books_fee=${Number(p.p_books_fee||0)},books_free=${Boolean(p.p_books_free)},
            joined_on=${p.p_joined_on||new Date().toISOString().slice(0,10)}::date,
            notes=${p.p_notes||null},group_id=${gid}::uuid,updated_at=now()
        where id=${existingId}::uuid and teacher_account_id=${teacherId}
        returning *`;
      if(!rr.length)throw new Error('private_student_not_found');
      if(String(p.p_parent_phone||'').trim()){
        guardian=await unifyGuardianPhoneLinks(a.school_id,p.p_parent_phone,guardian?.id||rr[0].guardian_account_id);
      }
      return {...rr[0],guardian_account_id:guardian?.id||rr[0].guardian_account_id};
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

    let guardian=null,guardianPassword=null,parentReused=false;
    const parentPhone=String(p.p_parent_phone||'').trim();
    if(parentPhone){
      guardian=await unifyGuardianPhoneLinks(a.school_id,parentPhone,null);
      parentReused=Boolean(guardian);
    }
    if(!guardian&&String(p.p_parent_name||'').trim()){
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
        private_code,full_name,phone,parent_name,parent_phone,monthly_fee,books_fee,books_free,joined_on,notes
      ) values(
        ${a.school_id},${teacherId},${gid}::uuid,${acct.id},${guardian?.id||null},
        ${code},${fullName},${p.p_phone||null},${p.p_parent_name||null},
        ${p.p_parent_phone||null},${Number(p.p_monthly_fee||0)},
        ${Number(p.p_books_fee||0)},${Boolean(p.p_books_free)},
        ${p.p_joined_on||new Date().toISOString().slice(0,10)}::date,${p.p_notes||null}
      ) returning *`)[0];

    if(guardian&&parentPhone){
      guardian=await unifyGuardianPhoneLinks(a.school_id,parentPhone,guardian.id)||guardian;
    }

    return {
      ...row,
      guardian_account_id:guardian?.id||row.guardian_account_id,
      student_username:acct.username,
      student_password:pw,
      student_internal_email:acct.internal_email,
      parent_username:guardian?.username||null,
      parent_password:guardianPassword,
      parent_internal_email:guardian?.internal_email||null,
      parent_reused:parentReused
    };
  }

  if(action==='teacher_private_student_issue_card'){
    const link=await assistantLink(a);
    const teacherId=a.account_type==='teacher'?a.account_id:link?.teacher_account_id;
    must(a,teacherId && (a.account_type==='teacher'||Boolean(link?.permissions?.students)));
    const id=String(p.p_private_student_id||'');
    const student=(await sql`select ps.*,spa.username student_username,gpa.username parent_username
      from public.teacher_private_students ps
      left join public.platform_accounts spa on spa.id=ps.platform_account_id
      left join public.platform_accounts gpa on gpa.id=ps.guardian_account_id
      where ps.id=${id}::uuid and ps.teacher_account_id=${teacherId} and ps.status='active'
      limit 1`)[0];
    if(!student)throw new Error('private_student_not_found');
    if(link){
      const gs=(await delegatedGroups(link.id)).map(x=>String(x.group_id));
      if(!gs.includes(String(student.group_id)))throw new Error('group_access_denied');
    }
    if(!student.platform_account_id)throw new Error('student_login_account_missing');
    const studentPassword=(await sql`select public.platform_make_password() password`)[0].password;
    await sql`update public.platform_accounts
      set password_hash=crypt(${studentPassword},gen_salt('bf',10)),is_active=true,updated_at=now()
      where id=${student.platform_account_id}`;
    let parentPassword=null;
    if(student.guardian_account_id){
      parentPassword=(await sql`select public.platform_make_password() password`)[0].password;
      await sql`update public.platform_accounts
        set password_hash=crypt(${parentPassword},gen_salt('bf',10)),is_active=true,updated_at=now()
        where id=${student.guardian_account_id}`;
    }
    return {
      ...student,
      student_username:student.student_username,
      student_password:studentPassword,
      parent_username:student.parent_username||null,
      parent_password:parentPassword
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
    if(rr[0].guardian_account_id){
      const guardianStillUsed=Number((await sql`select (
          (select count(*) from public.teacher_private_students
            where guardian_account_id=${rr[0].guardian_account_id} and status='active')
          +
          (select count(*) from public.platform_parent_student_links
            where parent_account_id=${rr[0].guardian_account_id})
          +
          (select count(*) from public.student_parents sp
            join public.platform_accounts pa on pa.parent_id=sp.parent_id
            where pa.id=${rr[0].guardian_account_id})
        )::int n`)[0]?.n||0);
      if(!guardianStillUsed){
        await sql`update public.platform_accounts set is_active=false,updated_at=now() where id=${rr[0].guardian_account_id}`;
      }
    }
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
      school_id,teacher_account_id,group_id,private_student_id,amount,paid_on,method,note,payment_kind,recorded_by_account_id
    ) values(
      ${a.school_id},${teacherId},${s.group_id},${s.id},${Number(p.p_amount||0)},
      ${p.p_date||new Date().toISOString().slice(0,10)}::date,${p.p_method||'cash'},
      ${p.p_note||null},${p.p_payment_kind||'tuition'},${a.account_id}
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
      school_id,teacher_account_id,assistant_account_id,permissions,contact_email,contact_phone
    ) values(
      ${a.school_id},${a.account_id},${acct.id},${JSON.stringify(p.p_permissions||{})}::jsonb,
      ${p.p_email||null},${p.p_phone||null}
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
    let resolvedParentId=a.parent_id||null;

    if(!resolvedParentId && a.account_type==='parent'){
      const displayName=String(a.display_name||'').trim();
      const username=String(a.username||'').trim();
      const internalEmail=String(a.internal_email||'').trim();

      const candidates=await sql`select pr.id,
        coalesce(to_jsonb(pr)->>'full_name','') full_name,
        coalesce(to_jsonb(pr)->>'phone','') phone,
        coalesce(to_jsonb(pr)->>'email','') email
        from public.parents pr
        where
          (${displayName}<>'' and lower(trim(coalesce(to_jsonb(pr)->>'full_name','')))=lower(trim(${displayName})))
          or (${username}<>'' and regexp_replace(coalesce(to_jsonb(pr)->>'phone',''),'\\D','','g')=
                                regexp_replace(${username},'\\D','','g'))
          or (${internalEmail}<>'' and lower(coalesce(to_jsonb(pr)->>'email',''))=lower(${internalEmail}))
        limit 5`;

      if(candidates.length===1){
        resolvedParentId=candidates[0].id;
      }else if(candidates.length>1){
        const exactName=candidates.find(x=>displayName && String(x.full_name||'').trim().toLowerCase()===displayName.toLowerCase());
        resolvedParentId=exactName?.id||candidates[0].id;
      }

      if(resolvedParentId){
        await sql`update public.platform_accounts
          set parent_id=${resolvedParentId}::uuid,updated_at=now()
          where id=${a.account_id}`;
      }
    }

    if(resolvedParentId){
      schoolStudentIds=(await sql`select student_id from public.student_parents where parent_id=${resolvedParentId}`).map(x=>x.student_id);
    }

    let guardianPhone='';
    const privatePhone=(await sql`select parent_phone
      from public.teacher_private_students
      where guardian_account_id=${a.account_id}
        and status='active'
        and coalesce(parent_phone,'')<>''
      order by updated_at desc nulls last
      limit 1`)[0]?.parent_phone||'';
    guardianPhone=String(privatePhone||'');
    if(!guardianPhone&&resolvedParentId){
      guardianPhone=String((await sql`select coalesce(to_jsonb(pr)->>'phone','') phone
        from public.parents pr where pr.id=${resolvedParentId} limit 1`)[0]?.phone||'');
    }
    if(guardianPhone){
      await unifyGuardianPhoneLinks(a.school_id,guardianPhone,a.account_id);
    }

    const directSchoolIds=(await sql`select student_id
      from public.platform_parent_student_links
      where school_id=${a.school_id} and parent_account_id=${a.account_id}`).map(x=>x.student_id);
    schoolStudentIds=[...new Set([...schoolStudentIds.map(String),...directSchoolIds.map(String)])];

    privateIds=(await sql`select id from public.teacher_private_students where guardian_account_id=${a.account_id} and status='active'`).map(x=>x.id);

    // Repair private guardian links by the parent name when the old registrar created
    // the account but did not persist guardian_account_id.
    if(!privateIds.length && String(a.display_name||'').trim()){
      const privateMatches=await sql`select id
        from public.teacher_private_students
        where school_id=${a.school_id}
          and status='active'
          and guardian_account_id is null
          and lower(trim(coalesce(parent_name,'')))=lower(trim(${String(a.display_name||'')}))`;
      if(privateMatches.length===1){
        await sql`update public.teacher_private_students
          set guardian_account_id=${a.account_id},updated_at=now()
          where id=${privateMatches[0].id}`;
        privateIds=[privateMatches[0].id];
      }
    }

    // Clean-install bootstrap: after test-data purge, if this is the only active parent
    // account and there is exactly one active school student, bind them once.
    if(!schoolStudentIds.length && !privateIds.length && a.account_type==='parent'){
      const parentCount=Number((await sql`select count(*)::int n
        from public.platform_accounts
        where school_id=${a.school_id} and account_type='parent' and is_active=true`)[0]?.n||0);
      const studentRows=await sql`select id from public.students
        where school_id=${a.school_id} and status='active'
        order by joined_on desc nulls last,id desc
        limit 2`;
      if(parentCount===1 && studentRows.length===1){
        await sql`insert into public.platform_parent_student_links(
          school_id,parent_account_id,student_id,relationship
        ) values(${a.school_id},${a.account_id},${studentRows[0].id},'guardian')
        on conflict(parent_account_id,student_id) do nothing`;
        schoolStudentIds=[String(studentRows[0].id)];
      }
    }

    const schoolStudents=schoolStudentIds.length?await sql`select s.id,s.student_no,s.full_name,g.name grade_name,
      coalesce((select sum(i.balance) from public.invoices i where i.student_id=s.id and i.status<>'void'),0) balance,
      coalesce((select sum(l.points) from public.student_point_ledger l where l.student_id=s.id),0)::int points
      from public.students s
      left join public.grades g on g.id=s.grade_id
      where s.id=any(${schoolStudentIds}::uuid[])`:[];
    const privateStudents=privateIds.length?await sql`select ps.id,ps.private_code,ps.full_name,ps.monthly_fee,ps.books_fee,ps.books_free,
      coalesce((select sum(p.amount) from public.teacher_private_payments p
        where p.private_student_id=ps.id and coalesce(p.payment_kind,'tuition')='tuition'
          and date_trunc('month',p.paid_on)=date_trunc('month',current_date)),0) month_paid,
      coalesce((select sum(p.amount) from public.teacher_private_payments p
        where p.private_student_id=ps.id and p.payment_kind='books'),0) books_paid,
      coalesce((select sum(pl.points) from public.teacher_private_point_ledger pl
        where pl.private_student_id=ps.id),0)::int points,
      (select att.status
        from public.teacher_private_attendance att
        where att.private_student_id=ps.id
        order by att.attendance_date desc,att.recorded_at desc
        limit 1) last_attendance_status,
      (select att.attendance_date
        from public.teacher_private_attendance att
        where att.private_student_id=ps.id
        order by att.attendance_date desc,att.recorded_at desc
        limit 1) last_attendance_date,
      (select att.minutes_late
        from public.teacher_private_attendance att
        where att.private_student_id=ps.id
        order by att.attendance_date desc,att.recorded_at desc
        limit 1) last_attendance_minutes_late,
      (select att.note
        from public.teacher_private_attendance att
        where att.private_student_id=ps.id
        order by att.attendance_date desc,att.recorded_at desc
        limit 1) last_attendance_note
      from public.teacher_private_students ps
      where ps.id=any(${privateIds}::uuid[])`:[];
    const schoolFinance=schoolStudentIds.length?await sql`select
      i.id record_id,
      s.id student_id,
      s.full_name student_name,
      'invoice'::text record_type,
      to_jsonb(i) record_json
      from public.invoices i
      join public.students s on s.id=i.student_id
      where i.student_id=any(${schoolStudentIds}::uuid[])
      order by coalesce(
        nullif(to_jsonb(i)->>'created_at','')::timestamptz,
        nullif(to_jsonb(i)->>'issued_at','')::timestamptz,
        now()
      ) desc`:[];
    const privateFinance=privateIds.length?await sql`
      select
        ('fee-'||ps.id::text)::text record_id,
        null::uuid student_id,
        ps.id private_student_id,
        ps.full_name student_name,
        'private_fee'::text record_type,
        jsonb_build_object(
          'monthly_fee',ps.monthly_fee,
          'books_fee',ps.books_fee,
          'books_free',ps.books_free,
          'month_paid',coalesce((select sum(pp.amount) from public.teacher_private_payments pp
            where pp.private_student_id=ps.id
              and coalesce(pp.payment_kind,'tuition')='tuition'
              and date_trunc('month',pp.paid_on)=date_trunc('month',current_date)),0),
          'books_paid',coalesce((select sum(pp.amount) from public.teacher_private_payments pp
            where pp.private_student_id=ps.id and pp.payment_kind='books'),0),
          'joined_on',ps.joined_on
        ) record_json
      from public.teacher_private_students ps
      where ps.id=any(${privateIds}::uuid[])
      union all
      select
        pp.id::text record_id,
        null::uuid student_id,
        pp.private_student_id,
        ps.full_name student_name,
        'private_payment'::text record_type,
        jsonb_build_object(
          'amount',pp.amount,
          'paid_on',pp.paid_on,
          'method',pp.method,
          'note',pp.note,
          'payment_kind',pp.payment_kind,
          'created_at',pp.created_at
        ) record_json
      from public.teacher_private_payments pp
      join public.teacher_private_students ps on ps.id=pp.private_student_id
      where pp.private_student_id=any(${privateIds}::uuid[])
      order by record_type,record_id desc`:[];
    await cleanupCertificateMigrationDuplicates(a.school_id);
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
    return {
      school_students:schoolStudents,
      private_students:privateStudents,
      finance_records:[...schoolFinance,...privateFinance],
      certificates:certs,
      exam_results:results
    };
  }

  if(action==='platform_groups_list_local'){
    const subjectExpr="coalesce(to_jsonb(c)->>'subject_name',to_jsonb(c)->>'name',to_jsonb(c)->>'title',to_jsonb(c)->>'subject')";
    if(a.account_type==='teacher'){
      return await sql`select distinct
        g.id group_id,g.name group_name,
        coalesce(to_jsonb(c)->>'subject_name',to_jsonb(c)->>'name',to_jsonb(c)->>'title',to_jsonb(c)->>'subject') subject_name,
        coalesce(t.full_name,pa.display_name,${a.display_name||null}) teacher_name,
        g.schedule_json,g.meeting_url,g.meeting_provider
        from public.study_groups g
        left join public.courses c on c.id=g.course_id
        left join public.teachers t on t.id=c.teacher_id
        left join public.platform_accounts pa on pa.teacher_id=c.teacher_id and pa.is_active=true
        where coalesce(g.is_active,true)=true
          and (
            exists(
              select 1 from public.teacher_room_management trm
              where trm.group_id=g.id
                and trm.teacher_account_id=${a.account_id}
                and trm.is_active=true
            )
            or (
              ${a.teacher_id||null}::uuid is not null
              and c.teacher_id=${a.teacher_id||null}
              and g.school_id=${a.school_id}
              and not exists(
                select 1
                from public.teacher_room_management trm2
                join public.study_groups pg on pg.id=trm2.group_id
                where trm2.teacher_account_id=${a.account_id}
                  and trm2.is_active=true
                  and lower(trim(pg.name))=lower(trim(g.name))
              )
            )
          )
        order by group_name`;
    }

    if(a.student_id){
      const schoolRows=await sql`select distinct
        g.id group_id,g.name group_name,
        coalesce(to_jsonb(c)->>'subject_name',to_jsonb(c)->>'name',to_jsonb(c)->>'title',to_jsonb(c)->>'subject') subject_name,
        coalesce(t.full_name,pa.display_name) teacher_name,
        g.schedule_json,g.meeting_url,g.meeting_provider
        from public.enrollments en
        join public.study_groups g on g.id=en.group_id
        join public.courses c on c.id=g.course_id
        left join public.teachers t on t.id=c.teacher_id
        left join public.platform_accounts pa on pa.teacher_id=c.teacher_id and pa.is_active=true
        where en.student_id=${a.student_id}
          and en.status='active'
          and g.school_id=${a.school_id}
          and g.is_active=true
        order by group_name`;
      if(schoolRows.length)return schoolRows;
    }

    await reconcileSinglePrivateRoomByAccount(a.account_id);
    const privateRows=await sql`select distinct
      g.id group_id,g.name group_name,
      coalesce(to_jsonb(c)->>'subject_name',to_jsonb(c)->>'name',to_jsonb(c)->>'title',to_jsonb(c)->>'subject') subject_name,
      teacher.display_name teacher_name,
      g.schedule_json,g.meeting_url,g.meeting_provider
      from public.teacher_private_students ps
      join public.study_groups g on g.id=ps.group_id
      join public.teacher_room_management trm
        on trm.group_id=ps.group_id
       and trm.teacher_account_id=ps.teacher_account_id
       and trm.is_active=true
      left join public.courses c on c.id=g.course_id
      left join public.platform_accounts teacher on teacher.id=ps.teacher_account_id
      where ps.platform_account_id=${a.account_id}
        and ps.status='active'
      order by group_name`;
    if(privateRows.length)return privateRows;

    if(a.account_type==='admin' || a.account_type==='staff'){
      return await sql`select distinct
        g.id group_id,g.name group_name,
        coalesce(to_jsonb(c)->>'subject_name',to_jsonb(c)->>'name',to_jsonb(c)->>'title',to_jsonb(c)->>'subject') subject_name,
        coalesce(t.full_name,pa.display_name) teacher_name,
        g.schedule_json,g.meeting_url,g.meeting_provider
        from public.study_groups g
        left join public.courses c on c.id=g.course_id
        left join public.teachers t on t.id=c.teacher_id
        left join public.platform_accounts pa on pa.teacher_id=c.teacher_id and pa.is_active=true
        where g.school_id=${a.school_id} and g.is_active=true
        order by group_name`;
    }

    return [];
  }

  if(action==='private_student_groups_list'){
    const rows=await sql`select
      ps.id private_student_id,
      g.id group_id,
      g.name group_name,
      coalesce(to_jsonb(c)->>'subject_name',to_jsonb(c)->>'name',to_jsonb(c)->>'title',to_jsonb(c)->>'subject') subject_name,
      teacher.display_name teacher_name,
      g.schedule_json,
      g.meeting_url,
      g.meeting_provider
      from public.teacher_private_students ps
      join public.study_groups g on g.id=ps.group_id
      join public.teacher_room_management trm
        on trm.group_id=ps.group_id
       and trm.teacher_account_id=ps.teacher_account_id
       and trm.is_active=true
      left join public.courses c on c.id=g.course_id
      left join public.platform_accounts teacher on teacher.id=ps.teacher_account_id
      where ps.platform_account_id=${a.account_id}
        and ps.status='active'
      order by g.name`;
    return rows;
  }

  if(action==='student_dashboard'){
    await cleanupCertificateMigrationDuplicates(a.school_id);
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
    const legacyRef=String(p.p_legacy_ref||'').trim()||null;
    if(Boolean(sid)===Boolean(psid))throw new Error('certificate_student_required');

    if(legacyRef){
      const existing=(await sql`select * from public.platform_certificates
        where school_id=${a.school_id}
          and (legacy_ref=${legacyRef} or id::text=${legacyRef})
        order by issued_at asc
        limit 1`)[0]||null;
      if(existing)return existing;
    }

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
      school_id,issuer_account_id,student_id,private_student_id,title,certificate_type,body,template,legacy_ref
    ) values(
      ${a.school_id},${a.account_id},${sid},${psid},${String(p.p_title||'شهادة تقدير')},
      ${p.p_type||'appreciation'},${p.p_body||null},${p.p_template||'classic'},${legacyRef}
    ) returning *`)[0];
  }

  if(action==='certificate_list_owned'){
    must(a,a.account_type==='teacher'||a.account_type==='admin'||a.account_type==='staff');
    await cleanupCertificateMigrationDuplicates(a.school_id);
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

  if(action==='teacher_update_group_schedule'){
    must(a,a.account_type==='teacher');
    const gid=String(p.p_group_id||'');
    if(!gid)throw new Error('group_id_required');
    const contracted=await privateRoomAccess(a,gid,false);
    let owned=contracted;
    if(!owned && a.teacher_id){
      owned=(await sql`select g.id
        from public.study_groups g
        join public.courses c on c.id=g.course_id
        where g.id=${gid}::uuid and g.school_id=${a.school_id} and c.teacher_id=${a.teacher_id}
        limit 1`)[0];
    }
    if(!owned)throw new Error('group_not_owned_by_teacher');
    const allowedDays=new Set(['saturday','sunday','monday','tuesday','wednesday','thursday','friday']);
    const raw=Array.isArray(p.p_sessions)?p.p_sessions:[];
    if(raw.length>30)throw new Error('too_many_sessions');
    const sessions=raw.map(x=>{
      const day=String(x?.day||'').toLowerCase();
      const time=String(x?.time||'');
      const duration=Math.max(15,Math.min(480,Number(x?.duration||60)||60));
      if(!allowedDays.has(day))throw new Error('invalid_session_day');
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('invalid_session_time');
      return {day,time,duration};
    });
    const keys=new Set();
    for(const x of sessions){
      const key=x.day+'|'+x.time;
      if(keys.has(key))throw new Error('duplicate_session');
      keys.add(key);
    }
    const schedule={sessions};
    return (await sql`update public.study_groups
      set schedule_json=${JSON.stringify(schedule)}::jsonb
      where id=${gid}::uuid
      returning id group_id,name group_name,schedule_json`)[0];
  }

  if(action==='platform_group_room_details'){
    const gid=String(p.p_group_id||'');
    if(!gid)throw new Error('group_id_required');

    let allowed=await privateRoomAccess(a,gid,false);
    if(!allowed && a.student_id){
      allowed=(await sql`select 1
        from public.enrollments en
        where en.group_id=${gid}::uuid
          and en.student_id=${a.student_id}
          and en.status='active'
        limit 1`)[0]||null;
    }
    if(!allowed && a.account_type==='teacher' && a.teacher_id){
      allowed=(await sql`select 1
        from public.study_groups g
        join public.courses c on c.id=g.course_id
        where g.id=${gid}::uuid
          and c.teacher_id=${a.teacher_id}
        limit 1`)[0]||null;
    }
    if(!allowed)throw new Error('group_access_denied');

    const room=(await sql`select
      g.id group_id,g.name group_name,g.schedule_json,
      g.meeting_url,g.meeting_provider,g.meeting_started_at,g.meeting_ended_at
      from public.study_groups g
      where g.id=${gid}::uuid
      limit 1`)[0];
    if(!room)throw new Error('group_not_found');
    return room;
  }

  if(action==='platform_set_group_meeting'){
    must(a,a.account_type==='teacher');
    const requestedGid=String(p.p_group_id||'');
    if(!requestedGid)throw new Error('group_id_required');

    const activePrivateRooms=await sql`select group_id
      from public.teacher_room_management
      where teacher_account_id=${a.account_id} and is_active=true
      order by updated_at desc`;

    // For a teacher with one contracted room, that room is authoritative.
    // This repairs old duplicate study_group ids that can still exist in the UI.
    const gid=activePrivateRooms.length===1
      ?String(activePrivateRooms[0].group_id)
      :requestedGid;

    const contracted=await privateRoomAccess(a,gid,false);
    let owned=contracted;
    if(!owned && a.teacher_id){
      owned=(await sql`select g.id
        from public.study_groups g
        join public.courses c on c.id=g.course_id
        where g.id=${gid}::uuid and g.school_id=${a.school_id} and c.teacher_id=${a.teacher_id}
        limit 1`)[0];
    }
    if(!owned)throw new Error('group_not_owned_by_teacher');

    if(activePrivateRooms.length===1){
      await sql`update public.teacher_private_students
        set group_id=${gid}::uuid,updated_at=now()
        where teacher_account_id=${a.account_id}
          and status='active'
          and group_id is distinct from ${gid}::uuid`;
    }

    const provider=String(p.p_provider||'zoom');
    const url=p.p_url?String(p.p_url).trim():null;
    if(url&&!/^https:\/\//i.test(url))throw new Error('invalid_meeting_url');

    return (await sql`update public.study_groups
      set meeting_provider=${provider},
          meeting_url=${url},
          meeting_started_at=case when ${url}::text is not null then now() else meeting_started_at end,
          meeting_ended_at=case when ${url}::text is null then now() else null end
      where id=${gid}::uuid
      returning id group_id,name group_name,meeting_provider,meeting_url,meeting_started_at,meeting_ended_at`)[0];
  }

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

  if(action==='admin_teacher_name_update'){
    must(a,adminEntityAllowed());
    const teacherId=String(p.p_teacher_id||'').trim();
    const fullName=String(p.p_full_name||'').replace(/\s+/g,' ').trim();
    if(!teacherId)throw new Error('teacher_id_required');
    if(fullName.length<2)throw new Error('teacher_name_required');

    const teacher=(await sql`update public.teachers
      set full_name=${fullName}
      where id=${teacherId}::uuid and school_id=${a.school_id}
      returning id teacher_id,full_name`)[0];
    if(!teacher)throw new Error('teacher_not_found');

    const accounts=await sql`update public.platform_accounts
      set display_name=${fullName},updated_at=now()
      where teacher_id=${teacherId}::uuid and school_id=${a.school_id}
      returning id account_id,display_name`;

    return {
      teacher_id:teacher.teacher_id,
      full_name:teacher.full_name,
      account_id:accounts[0]?.account_id||null,
      updated_accounts:accounts.length
    };
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

  if(action==='admin_purge_students_parents'){
    must(a,adminEntityAllowed());
    if(String(p.p_confirm||'')!=='PURGE_STUDENTS_PARENTS')throw new Error('purge_confirmation_required');

    return await sql.begin(async tx=>{
      const schoolId=String(a.school_id);

      const studentRows=await tx`select id from public.students where school_id=${a.school_id}`;
      const studentIds=studentRows.map(x=>String(x.id));

      const privateRows=await tx`select id,platform_account_id,guardian_account_id
        from public.teacher_private_students
        where school_id=${a.school_id}`;
      const privateIds=privateRows.map(x=>String(x.id));
      const privateAccountIds=privateRows.flatMap(x=>[x.platform_account_id,x.guardian_account_id]).filter(Boolean).map(String);

      const parentRows=studentIds.length
        ?await tx`select distinct p.id
          from public.parents p
          left join public.student_parents sp on sp.parent_id=p.id
          left join public.platform_accounts pa on pa.parent_id=p.id
          where sp.student_id=any(${studentIds}::uuid[])
             or (pa.school_id=${a.school_id} and (pa.account_type='parent' or pa.parent_id is not null))`
        :await tx`select distinct p.id
          from public.parents p
          join public.platform_accounts pa on pa.parent_id=p.id
          where pa.school_id=${a.school_id} and (pa.account_type='parent' or pa.parent_id is not null)`;
      const parentIds=parentRows.map(x=>String(x.id));

      const accountRows=await tx`select id,app_user_id
        from public.platform_accounts
        where school_id=${a.school_id}
          and (
            account_type in ('student','parent')
            or student_id=any(${studentIds}::uuid[])
            or parent_id=any(${parentIds}::uuid[])
            or id=any(${privateAccountIds}::uuid[])
          )`;
      const accountIds=[...new Set(accountRows.map(x=>String(x.id)))];
      const appUserIds=[...new Set(accountRows.map(x=>x.app_user_id).filter(Boolean).map(String))];

      const before={
        students:studentIds.length,
        parents:parentIds.length,
        private_students:privateIds.length,
        accounts:accountIds.length
      };

      const colRows=await tx`select table_name,column_name
        from information_schema.columns
        where table_schema='public'`;
      const tableCols=new Map();
      for(const row of colRows){
        if(!tableCols.has(row.table_name))tableCols.set(row.table_name,new Set());
        tableCols.get(row.table_name).add(row.column_name);
      }

      const roots=new Set(['students','parents','teacher_private_students','platform_accounts','app_users']);
      const arrText=ids=>ids.length?`array[${ids.map(x=>"'" + String(x).replaceAll("'","''") + "'").join(',')}]::text[]`:null;
      const studentArr=arrText(studentIds),parentArr=arrText(parentIds),privateArr=arrText(privateIds),accountArr=arrText(accountIds);

      for(const [table,cols] of tableCols){
        if(roots.has(table))continue;
        const clauses=[];
        if(studentArr&&cols.has('student_id'))clauses.push(`student_id::text=any(${studentArr})`);
        if(parentArr&&cols.has('parent_id'))clauses.push(`parent_id::text=any(${parentArr})`);
        if(privateArr&&cols.has('private_student_id'))clauses.push(`private_student_id::text=any(${privateArr})`);
        if(accountArr){
          for(const col of ['account_id','sender_account_id','recipient_account_id','guardian_account_id','platform_account_id','student_account_id','parent_account_id','recorded_by_account_id','archived_by_account_id']){
            if(cols.has(col))clauses.push(`"${col}"::text=any(${accountArr})`);
          }
        }
        if(clauses.length){
          await tx.unsafe(`delete from public."${String(table).replaceAll('"','""')}" where ${clauses.join(' or ')}`);
        }
      }

      if(tableCols.has('platform_entity_archive')){
        const entityIds=[...studentIds,...parentIds,...privateIds,...accountIds];
        if(entityIds.length){
          const entityArr=arrText(entityIds);
          await tx.unsafe(`delete from public.platform_entity_archive where entity_id::text=any(${entityArr})`);
        }
      }

      const studentPrefixes=[
        '[PRIVATE_STUDENT]','[PRIVATE_STUDENT_LINK]','[PRIVATE_PARENT_LINK]','[PRIVATE_CREDENTIAL_CARD]',
        '[PRIVATE_PAYMENT]','[MANAGED_PRIVATE_PAYMENT]','[MANAGED_PRIVATE_PAYMENT_ACTION]',
        '[MANAGED_PRIVATE_ATTENDANCE]','[MANAGED_PRIVATE_ATTENDANCE_ACTION]',
        '[PARENT_LINK]','[STUDENT_PARENT_LINK]','[PARENT_LINK_MASTER]',
        '[SCHOOL_PAYMENT]','[SCHOOL_PAYMENT_VOID]',
        '[HOMEWORK_ASSIGN]','[HOMEWORK_SUBMISSION]','[HOMEWORK_GRADED]','[HOMEWORK_PARENT]'
      ];
      for(const [table,cols] of tableCols){
        if(!cols.has('subject'))continue;
        const prefixSql=studentPrefixes.map(x=>`subject like '${x.replaceAll("'","''")}%' `).join(' or ');
        const schoolClause=cols.has('school_id')?` and school_id::text='${schoolId.replaceAll("'","''")}'`:'';
        await tx.unsafe(`delete from public."${String(table).replaceAll('"','""')}" where (${prefixSql})${schoolClause}`);
      }

      if(privateIds.length)await tx`delete from public.teacher_private_students where id=any(${privateIds}::uuid[])`;
      if(accountIds.length)await tx`delete from public.platform_accounts where id=any(${accountIds}::uuid[])`;
      if(studentIds.length)await tx`delete from public.students where id=any(${studentIds}::uuid[])`;
      if(parentIds.length)await tx`delete from public.parents where id=any(${parentIds}::uuid[])`;

      if(appUserIds.length){
        await tx`delete from public.app_users u
          where u.id=any(${appUserIds}::uuid[])
            and not exists(select 1 from public.platform_accounts pa where pa.app_user_id=u.id)`;
      }

      const after=(await tx`select
        (select count(*)::int from public.students where school_id=${a.school_id}) students,
        (select count(*)::int from public.teacher_private_students where school_id=${a.school_id}) private_students,
        (select count(*)::int from public.platform_accounts
          where school_id=${a.school_id}
            and (account_type in ('student','parent') or student_id is not null or parent_id is not null)) student_parent_accounts`)[0];

      return {purged:true,before,after};
    });
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
  await reconcileSinglePrivateRoomByAccount(result.account_id);
  const ps=(await sql`select ps.id,ps.group_id,ps.teacher_account_id,g.name group_name
    from public.teacher_private_students ps
    left join public.study_groups g on g.id=ps.group_id
    where ps.platform_account_id=${result.account_id} and ps.status='active' limit 1`)[0];
  if(ps)return {...result,account_type:'private_student',role:'private_student',
    private_student_id:ps.id,private_group_id:ps.group_id,group_id:ps.group_id,
    private_teacher_account_id:ps.teacher_account_id,private_group_name:ps.group_name};
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
        let legacyResult=null,legacyError=null;
        try{
          const rows=await sql`select public.roven_rpc('platform_login',${token},${JSON.stringify(p)}::jsonb) result`;
          legacyResult=rows[0]?.result??null;
        }catch(e){
          legacyError=e;
        }
        if(legacyResult?.account_id){
          return json(await decorateLogin(legacyResult),200,o);
        }

        const identity=String(p.p_identity||'').trim();
        const password=String(p.p_password||'');
        if(!identity||!password){
          return json({error:'invalid_credentials'},401,o);
        }

        const accounts=await sql`select
          a.id account_id,a.school_id,a.account_type,a.student_id,a.teacher_id,a.parent_id,a.app_user_id,
          a.account_code,a.username,a.internal_email,a.display_name,u.role
          from public.platform_accounts a
          left join public.app_users u on u.id=a.app_user_id and u.is_active=true
          where a.is_active=true
            and (
              lower(coalesce(a.username,''))=lower(${identity})
              or lower(coalesce(a.internal_email,''))=lower(${identity})
              or lower(coalesce(a.account_code,''))=lower(${identity})
            )
            and a.password_hash is not null
            and a.password_hash=crypt(${password},a.password_hash)
          order by a.updated_at desc nulls last
          limit 1`;

        const account=accounts[0]||null;
        if(!account){
          const legacyMessage=String(legacyError?.message||'');
          return json({error:legacyMessage||'invalid_credentials'},401,o);
        }

        const session=(await sql`insert into public.platform_sessions(account_id)
          values(${account.account_id})
          returning token,created_at,expires_at`)[0];

        const result={
          ...account,
          session_token:session.token,
          session_expires_at:session.expires_at
        };
        return json(await decorateLogin(result),200,o);
      }

      if(action==='register_new_student'){
        const rows=await sql`select public.roven_rpc('register_new_student',${token},${JSON.stringify(p)}::jsonb) result`;
        const result=rows[0]?.result??null;
        const rr=Array.isArray(result)?result[0]:result;
        const studentId=rr?.student_id||null;
        const parentUsername=String(rr?.parent_username||'').trim();

        if(studentId && parentUsername){
          const student=(await sql`select id,school_id from public.students
            where id=${studentId}::uuid limit 1`)[0]||null;
          if(student){
            const parentAccount=(await sql`select id
              from public.platform_accounts
              where school_id=${student.school_id}
                and account_type='parent'
                and lower(coalesce(username,''))=lower(${parentUsername})
                and is_active=true
              order by created_at desc
              limit 1`)[0]||null;
            if(parentAccount){
              await sql`insert into public.platform_parent_student_links(
                school_id,parent_account_id,student_id,relationship
              ) values(
                ${student.school_id},${parentAccount.id},${student.id},
                ${String(p.p_relationship||'guardian')}
              ) on conflict(parent_account_id,student_id)
                do update set relationship=excluded.relationship`;
            }
          }
        }
        return json(result,200,o);
      }

      if(action==='platform_attendance_groups'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);
        if(a.account_type==='teacher'){
          const localGroups=await custom('platform_attendance_groups_local',a,{});
          let legacyGroups=[];
          try{
            const rr=await sql`select public.roven_rpc(
              'platform_attendance_groups',
              ${token},
              ${JSON.stringify(p||{})}::jsonb
            ) result`;
            legacyGroups=Array.isArray(rr[0]?.result)?rr[0].result:[];
          }catch{}

          const merged=new Map();
          for(const row of [...(Array.isArray(localGroups)?localGroups:[]),...legacyGroups]){
            const key=String(row?.group_name||row?.name||row?.group_id||'').trim().toLowerCase();
            if(!key)continue;
            if(!merged.has(key))merged.set(key,row);
          }
          return json([...merged.values()],200,o);
        }
      }

      if(action==='platform_list_groups'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);

        await materializeLegacyPrivateStudentFromMail(a,token,null);

        // Use the exact same source that powers attendance for teacher rooms,
        // then enrich it with room details. This keeps "My groups" and attendance
        // on the same canonical group ids.
        if(a.account_type==='teacher'){
          let attendanceGroups=await custom('platform_attendance_groups_local',a,{});
          let legacyGroups=[];
          try{
            const rr=await sql`select public.roven_rpc(
              'platform_attendance_groups',
              ${token},
              ${JSON.stringify(p||{})}::jsonb
            ) result`;
            legacyGroups=Array.isArray(rr[0]?.result)?rr[0].result:[];
          }catch{}

          const mergedGroups=new Map();
          for(const row of [...(Array.isArray(attendanceGroups)?attendanceGroups:[]),...legacyGroups]){
            const key=String(row?.group_name||row?.name||row?.group_id||'').trim().toLowerCase();
            if(!key)continue;
            if(!mergedGroups.has(key))mergedGroups.set(key,row);
          }
          attendanceGroups=[...mergedGroups.values()];

          if(attendanceGroups.length){
            const ids=attendanceGroups.map(x=>String(x.group_id)).filter(Boolean);
            const details=ids.length?await sql`select
                g.id group_id,
                g.name group_name,
                coalesce(
                  to_jsonb(c)->>'subject_name',
                  to_jsonb(c)->>'name',
                  to_jsonb(c)->>'title',
                  to_jsonb(c)->>'subject'
                ) subject_name,
                g.schedule_json,
                g.meeting_url,
                g.meeting_provider,
                g.meeting_started_at,
                g.meeting_ended_at
              from public.study_groups g
              left join public.courses c on c.id=g.course_id
              where g.id=any(${ids}::uuid[])`:[];
            const byId=new Map(details.map(x=>[String(x.group_id),x]));
            const rows=attendanceGroups.map(g=>({
              ...g,
              ...(byId.get(String(g.group_id))||{}),
              group_id:g.group_id,
              group_name:g.group_name||byId.get(String(g.group_id))?.group_name,
              teacher_name:g.teacher_name||a.display_name||null,
              subject_name:byId.get(String(g.group_id))?.subject_name||null,
              schedule_json:byId.get(String(g.group_id))?.schedule_json||null,
              meeting_url:byId.get(String(g.group_id))?.meeting_url||null,
              meeting_provider:byId.get(String(g.group_id))?.meeting_provider||null,
              meeting_started_at:byId.get(String(g.group_id))?.meeting_started_at||null,
              meeting_ended_at:byId.get(String(g.group_id))?.meeting_ended_at||null
            }));
            return json(rows,200,o);
          }
        }

        const directGroups=await custom('platform_groups_list_local',a,p);
        if(Array.isArray(directGroups)&&directGroups.length)return json(directGroups,200,o);

        // Compatibility for private students created by the old registration fallback:
        // the account is a normal student account and its private group was recorded
        // in an internal PRIVATE_STUDENT_LINK message instead of teacher_private_students.
        if(a.account_type==='student'){
          try{
            const mailRpc=await sql`select public.roven_rpc(
              'platform_mail_list',
              ${token},
              ${JSON.stringify({p_folder:'inbox'})}::jsonb
            ) result`;
            const mails=Array.isArray(mailRpc[0]?.result)?mailRpc[0].result:[];
            const links=mails
              .filter(m=>String(m?.subject||'').startsWith('[PRIVATE_STUDENT_LINK]'))
              .map(m=>{
                let body=m?.body;
                if(typeof body==='string'){
                  try{body=JSON.parse(body)}catch{body={}}
                }
                return {...(body&&typeof body==='object'?body:{}),_sent_at:m?.sent_at||null};
              })
              .filter(x=>x.group_id)
              .sort((x,y)=>new Date(y.linked_at||y._sent_at||0)-new Date(x.linked_at||x._sent_at||0));

            const link=links[0]||null;
            if(link?.group_id){
              const legacyGroups=await sql`select
                g.id group_id,g.name group_name,
                coalesce(
                  to_jsonb(c)->>'subject_name',
                  to_jsonb(c)->>'name',
                  to_jsonb(c)->>'title',
                  to_jsonb(c)->>'subject',
                  ${link.subject_name||null}
                ) subject_name,
                coalesce(t.full_name,pa.display_name,${link.teacher_name||null}) teacher_name,
                g.schedule_json,g.meeting_url,g.meeting_provider
                from public.study_groups g
                left join public.courses c on c.id=g.course_id
                left join public.teachers t on t.id=c.teacher_id
                left join public.platform_accounts pa on pa.teacher_id=c.teacher_id and pa.is_active=true
                where g.id=${String(link.group_id)}::uuid
                  and g.school_id=${a.school_id}
                  and g.is_active=true
                limit 1`;
              if(legacyGroups.length)return json(legacyGroups,200,o);
            }
          }catch{}
        }

        return json([],200,o);
      }

      if(action==='platform_issue_points'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);
        await ensureSchema();

        const sid=String(p.p_student_id||'').trim();
        const gid=String(p.p_group_id||'').trim();
        const studentNo=String(p.p_student_no||'').trim();
        const studentName=String(p.p_student_name||'').trim();

        if(sid){
          let access=null;
          if(gid){
            try{
              access=await privateRoomAccess(a,gid,false);
              if(access)await materializeLegacyPrivateStudentsForRoom(access);
            }catch{}
          }

          let ps=(await sql`select ps.id,ps.school_id,ps.teacher_account_id,ps.group_id,ps.platform_account_id,ps.private_code,ps.full_name
            from public.teacher_private_students ps
            where ps.status='active'
              and ps.school_id=${a.school_id}
              and (
                ps.id::text=${sid}
                or coalesce(ps.platform_account_id::text,'')=${sid}
                or exists(
                  select 1
                  from public.platform_accounts spa
                  where spa.id=ps.platform_account_id
                    and coalesce(spa.student_id::text,'')=${sid}
                )
                or (${studentNo}<>'' and lower(trim(ps.private_code))=lower(trim(${studentNo})))
              )
            order by ps.updated_at desc nulls last
            limit 1`)[0]||null;

          if(!ps && access){
            const aliases=(access.alias_group_ids||[access.canonical_group_id||gid]).map(String);
            ps=(await sql`select ps.id,ps.school_id,ps.teacher_account_id,ps.group_id,ps.platform_account_id,ps.private_code,ps.full_name
              from public.teacher_private_students ps
              where ps.status='active'
                and ps.teacher_account_id=${access.teacher_account_id}
                and ps.group_id=any(${aliases}::uuid[])
                and (
                  (${studentNo}<>'' and lower(trim(ps.private_code))=lower(trim(${studentNo})))
                  or (${studentName}<>'' and lower(trim(ps.full_name))=lower(trim(${studentName})))
                )
              order by ps.updated_at desc nulls last
              limit 1`)[0]||null;
          }

          if(ps){
            const isOwner=a.account_type==='teacher' && String(ps.teacher_account_id)===String(a.account_id);
            const isManagement=a.account_type==='admin' || a.account_type==='staff';
            if(!isOwner&&!isManagement)throw new Error('not_authorized');
            if(String(ps.school_id)!==String(a.school_id))throw new Error('not_authorized');

            const points=Math.trunc(Number(p.p_points||0));
            const reason=String(p.p_reason||'').trim();
            if(!points)throw new Error('points_required');
            if(!reason)throw new Error('reason_required');

            await sql`insert into public.teacher_private_point_ledger(
              school_id,teacher_account_id,group_id,private_student_id,points,reason,category,issued_by_account_id
            ) values(
              ${ps.school_id},${ps.teacher_account_id},${ps.group_id},${ps.id},
              ${points},${reason},${p.p_category||null},${a.account_id}
            )`;
            const balance=Number((await sql`select coalesce(sum(points),0)::int balance
              from public.teacher_private_point_ledger
              where private_student_id=${ps.id}`)[0]?.balance||0);
            return json({
              student_id:sid,
              private_student_id:ps.id,
              student_name:ps.full_name,
              balance
            },200,o);
          }
        }
      }

      if(action==='platform_student_points_summary'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);
        await ensureSchema();

        const ps=(await sql`select id
          from public.teacher_private_students
          where platform_account_id=${a.account_id} and status='active'
          order by updated_at desc nulls last
          limit 1`)[0]||null;
        if(ps){
          const balance=Number((await sql`select coalesce(sum(points),0)::int balance
            from public.teacher_private_point_ledger
            where private_student_id=${ps.id}`)[0]?.balance||0);
          const recent=await sql`select points,reason,category,created_at
            from public.teacher_private_point_ledger
            where private_student_id=${ps.id}
            order by created_at desc
            limit 20`;
          return json({balance,level:'مبتدئ',recent},200,o);
        }
      }

      if(action==='platform_points_leaderboard'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);
        await ensureSchema();

        let legacy=[];
        try{
          const rr=await sql`select public.roven_rpc(
            'platform_points_leaderboard',
            ${token},
            ${JSON.stringify(p||{})}::jsonb
          ) result`;
          legacy=Array.isArray(rr[0]?.result)?rr[0].result:[];
        }catch{}

        const privateRows=await sql`select
          ps.id student_id,
          ps.full_name student_name,
          'دروس خاصة'::text grade_name,
          coalesce(sum(pl.points),0)::int points,
          'مبتدئ'::text level
          from public.teacher_private_students ps
          join public.teacher_private_point_ledger pl on pl.private_student_id=ps.id
          where ps.school_id=${a.school_id} and ps.status='active'
          group by ps.id,ps.full_name
          having coalesce(sum(pl.points),0)<>0`;

        const merged=[...legacy,...privateRows]
          .sort((x,y)=>Number(y.points||0)-Number(x.points||0))
          .slice(0,100);
        return json(merged,200,o);
      }

      if(action==='parent_dashboard'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);

        let dashboard=await custom('parent_dashboard',a,p);
        const hasChildren=(dashboard?.school_students?.length||0)+(dashboard?.private_students?.length||0);

        if(!hasChildren && a.account_type==='parent'){
          try{
            const mailRpc=await sql`select public.roven_rpc(
              'platform_mail_list',
              ${token},
              ${JSON.stringify({p_folder:'inbox'})}::jsonb
            ) result`;
            const mails=Array.isArray(mailRpc[0]?.result)?mailRpc[0].result:[];

            // Normal school student link.
            const schoolLinks=mails
              .filter(m=>String(m?.subject||'').startsWith('[PARENT_LINK]'))
              .map(m=>{
                let body=m?.body;
                if(typeof body==='string'){
                  try{body=JSON.parse(body)}catch{body={}}
                }
                return {...(body&&typeof body==='object'?body:{}),_sent_at:m?.sent_at||null};
              })
              .filter(x=>x.student_id)
              .sort((x,y)=>new Date(y.created_at||y._sent_at||0)-new Date(x.created_at||x._sent_at||0));

            const schoolLink=schoolLinks[0]||null;
            if(schoolLink?.student_id){
              let parentId=a.parent_id||null;

              if(!parentId){
                // Prefer an already existing relation created by the legacy registrar.
                const existingRel=(await sql`select parent_id
                  from public.student_parents
                  where student_id=${String(schoolLink.student_id)}::uuid
                  limit 1`)[0]||null;
                parentId=existingRel?.parent_id||null;
              }

              if(!parentId){
                const phone=String(schoolLink.parent_phone||'').trim();
                const email=String(schoolLink.parent_email||schoolLink.parent_internal_email||'').trim();
                const name=String(schoolLink.parent_name||'').trim();
                const parent=(await sql`select pr.id
                  from public.parents pr
                  where (
                    (${phone}<>'' and regexp_replace(coalesce(to_jsonb(pr)->>'phone',''),'\\D','','g')=
                                      regexp_replace(${phone},'\\D','','g'))
                    or (${email}<>'' and lower(coalesce(to_jsonb(pr)->>'email',''))=lower(${email}))
                    or (${name}<>'' and lower(trim(coalesce(to_jsonb(pr)->>'full_name','')))=lower(trim(${name})))
                  )
                  limit 1`)[0]||null;
                parentId=parent?.id||null;
              }

              if(parentId){
                await sql`update public.platform_accounts
                  set parent_id=${parentId}::uuid,updated_at=now()
                  where id=${a.account_id}`;

                const relCols=await sql`select column_name
                  from information_schema.columns
                  where table_schema='public' and table_name='student_parents'`;
                const hasRelationship=relCols.some(x=>x.column_name==='relationship');
                if(hasRelationship){
                  await sql`insert into public.student_parents(student_id,parent_id,relationship)
                    values(
                      ${String(schoolLink.student_id)}::uuid,
                      ${parentId}::uuid,
                      ${String(schoolLink.relationship||'guardian')}
                    )
                    on conflict do nothing`;
                }else{
                  await sql`insert into public.student_parents(student_id,parent_id)
                    values(${String(schoolLink.student_id)}::uuid,${parentId}::uuid)
                    on conflict do nothing`;
                }

                const repaired={...a,parent_id:parentId};
                dashboard=await custom('parent_dashboard',repaired,p);
              }
            }

            // Private student link remains supported as a fallback.
            const totalChildren=(dashboard?.school_students?.length||0)+(dashboard?.private_students?.length||0);
            if(!totalChildren){
              const links=mails
                .filter(m=>String(m?.subject||'').startsWith('[PRIVATE_PARENT_LINK]'))
                .map(m=>{
                  let body=m?.body;
                  if(typeof body==='string'){
                    try{body=JSON.parse(body)}catch{body={}}
                  }
                  return {...(body&&typeof body==='object'?body:{}),_sent_at:m?.sent_at||null};
                })
                .filter(x=>x.student_name||x.group_id)
                .sort((x,y)=>new Date(y.linked_at||y._sent_at||0)-new Date(x.linked_at||x._sent_at||0));

              const link=links[0]||null;
              if(link){
                let candidate=null;

                if(link.group_id && link.student_name){
                  candidate=(await sql`select ps.id
                    from public.teacher_private_students ps
                    where ps.group_id=${String(link.group_id)}::uuid
                      and ps.status='active'
                      and lower(trim(ps.full_name))=lower(trim(${String(link.student_name)}))
                    order by ps.updated_at desc nulls last
                    limit 1`)[0]||null;
                }

                if(!candidate && link.student_name && link.teacher_internal_email){
                  candidate=(await sql`select ps.id
                    from public.teacher_private_students ps
                    join public.platform_accounts teacher on teacher.id=ps.teacher_account_id
                    where ps.status='active'
                      and lower(trim(ps.full_name))=lower(trim(${String(link.student_name)}))
                      and lower(coalesce(teacher.internal_email,''))=lower(${String(link.teacher_internal_email)})
                    order by ps.updated_at desc nulls last
                    limit 1`)[0]||null;
                }

                if(candidate?.id){
                  await sql`update public.teacher_private_students
                    set guardian_account_id=${a.account_id},updated_at=now()
                    where id=${candidate.id}`;
                  dashboard=await custom('parent_dashboard',a,p);
                }
              }
            }
          }catch{}
        }

        return json(dashboard,200,o);
      }

      if(action==='platform_attendance_roster' || action==='platform_save_attendance'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);
        const gid=String(p.p_group_id||'');
        await materializeLegacyPrivateStudentFromMail(a,token,gid);
        const room=await privateRoomAccess(a,gid,false);
        if(room){
          const mapped=action==='platform_attendance_roster'
            ?'private_room_attendance_roster'
            :'private_room_attendance_save';
          return json(await custom(mapped,a,p),200,o);
        }
      }

      if(action==='platform_group_chat_list' || action==='platform_group_chat_send'){
        const a=await actorFromToken(token);
        if(!a)return json({error:'invalid_or_expired_session'},401,o);
        const gid=String(p.p_group_id||'');
        await materializeLegacyPrivateStudentFromMail(a,token,gid);
        const room=await privateRoomAccess(a,gid,true);
        if(room){
          const mapped=action==='platform_group_chat_list'?'platform_group_chat_list_v2':'platform_group_chat_send_v2';
          return json(await custom(mapped,a,p),200,o);
        }
      }

      const customActions=new Set([
        'teacher_private_students_list','teacher_private_student_upsert','teacher_private_student_delete','teacher_private_student_issue_card',
        'teacher_room_contract_set','teacher_room_contracts_list',
        'admin_teacher_room_finance','admin_teacher_room_payment_add','admin_teacher_room_payment_void',
        'teacher_private_attendance_save','teacher_private_payment_add',
        'teacher_assistants_list','teacher_assistant_create','teacher_assistant_update','teacher_assistant_delete',
        'assistant_context','parent_dashboard','student_dashboard',
        'certificate_create','certificate_list_owned','certificate_delete',
        'exam_create','exam_save_questions','exam_publish','exam_delete','exam_list_owned',
        'exam_my_available','exam_get','exam_submit','exam_attempts_owned','exam_grade_essay',
        'products_list','product_create','product_delete','product_sale_add','product_sales_summary',
        'teacher_roven_contacts','school_contacts','archive_school_entity',
        'platform_direct_chat_contacts','platform_direct_chat_list','platform_direct_chat_send',
        'platform_group_room_details','platform_set_group_meeting','teacher_update_group_schedule',
        'admin_accounts_all','admin_students_all','admin_teachers_all','admin_groups_all','admin_teacher_name_update',
        'admin_entity_set_active','admin_entity_delete','admin_purge_students_parents'
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
