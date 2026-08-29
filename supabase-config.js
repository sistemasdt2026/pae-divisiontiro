// ============================================================
// Configuración del cliente de Supabase — PAE
// La anon/publishable key es pública por diseño (el control real
// de acceso lo hace RLS en la base). Nunca poner acá la
// service_role key.
// ============================================================
const SUPABASE_URL = 'https://mucnnzovntbukarusyeu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VRSjywAAhrZbRTfv5wCl-g_uZE0gv6j';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.sessionStorage // evita dejar el token persistente indefinidamente
  }
});
