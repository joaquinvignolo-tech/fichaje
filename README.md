# Sistema de Fichaje con Geolocalización

## ¿Qué hace?
- Los empleados fichan entrada/salida desde el celular o la computadora del negocio
- Se verifica que estén dentro del radio del negocio (geolocalización)
- Cada empleado tiene un PIN de 4 dígitos
- Panel de administración para dueño y encargado
- Historial y resumen de horas por día

---

## Setup paso a paso

### 1. Crear cuenta en Supabase (gratis)
1. Entrar a https://supabase.com y crear cuenta
2. Crear un nuevo proyecto
3. Ir a **Settings > API** y copiar:
   - `Project URL` → va en `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → va en `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Crear las tablas
1. En Supabase ir a **SQL Editor**
2. Pegar el contenido de `supabase_schema.sql` y ejecutar
3. Esto crea las tablas y un admin inicial con PIN `1234`

### 3. Configurar el proyecto
1. Copiar `.env.local.example` a `.env.local`
2. Completar con tus valores de Supabase
3. Para las coordenadas del negocio: ir a Google Maps, hacer click derecho en tu negocio → "¿Qué hay aquí?" → copiar latitud y longitud

### 4. Subir a Vercel (gratis)
1. Subir esta carpeta a un repositorio en GitHub
2. Entrar a https://vercel.com y crear cuenta
3. Importar el repositorio
4. En **Environment Variables** agregar las 5 variables del `.env.local`
5. Deploy → Vercel te da una URL tipo `tunegocio.vercel.app`

---

## Uso

### Pantalla de fichaje (la que ven los empleados)
- Entrar a `tunegocio.vercel.app`
- Tocar el nombre → ingresar PIN de 4 dígitos → confirmar
- El navegador pide permiso de ubicación la primera vez

### Panel admin
- Entrar a `tunegocio.vercel.app/admin`
- Ingresar PIN de administrador
- Desde acá: ver registros del día, resumen de horas, agregar/dar de baja empleados

---

## Cambiar el PIN del admin inicial
En Supabase → Table Editor → tabla `empleados` → editar el registro del Dueño → cambiar el campo `pin`

## Cambiar el radio de geolocalización
En `.env.local` cambiar `NEXT_PUBLIC_RADIO_METROS` (por defecto 150 metros)

---

## Tecnologías usadas
- Next.js 14 (React)
- Supabase (base de datos PostgreSQL + autenticación)
- Vercel (hosting gratuito)
- Geolocation API del navegador
