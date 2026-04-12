-- Ejecutar en Supabase > SQL Editor

create table empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rol text not null default 'Empleado',
  pin text not null,
  es_admin boolean default false,
  activo boolean default true,
  created_at timestamptz default now()
);

create table fichajes (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid references empleados(id),
  accion text not null check (accion in ('entrada','salida')),
  hora timestamptz default now(),
  lat double precision,
  lng double precision
);

-- Empleado admin inicial (PIN: 1234 — cambiarlo después)
insert into empleados (nombre, rol, pin, es_admin)
values ('Dueño', 'Administrador', '1234', true);

-- Índice para consultas por fecha
create index fichajes_hora_idx on fichajes(hora);
create index fichajes_empleado_idx on fichajes(empleado_id);

-- Row Level Security (RLS) — acceso público de lectura/escritura vía anon key
alter table empleados enable row level security;
alter table fichajes enable row level security;

create policy "empleados_public" on empleados for all using (true) with check (true);
create policy "fichajes_public" on fichajes for all using (true) with check (true);
