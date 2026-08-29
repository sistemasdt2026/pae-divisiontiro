// ============================================================
// Autenticación — login, logout, obtención de rol (profiles)
// ============================================================

let currentUser = null;
let currentProfile = null; // { id, nombre, rol }

async function iniciarSesion(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: traducirErrorAuth(error) };

  const perfil = await cargarPerfil(data.user.id);
  if (!perfil) {
    await supabaseClient.auth.signOut();
    return { success: false, error: 'Tu usuario no tiene un perfil asignado. Contactá al administrador.' };
  }

  currentUser = data.user;
  currentProfile = perfil;
  return { success: true };
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  window.location.href = 'login.html';
}

async function cargarPerfil(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, nombre, rol')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

// Verifica que haya una sesión activa y un perfil válido.
// Se llama al cargar cualquier página protegida (todo menos login.html).
async function verificarSesion() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }

  const perfil = await cargarPerfil(session.user.id);
  if (!perfil) {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
    return null;
  }

  currentUser = session.user;
  currentProfile = perfil;
  return perfil;
}

function tienePermiso(accion) {
  // accion: 'ver' | 'cargar' | 'editar' | 'eliminar'
  if (!currentProfile) return false;
  const rol = currentProfile.rol;
  if (rol === 'administrador') return true;
  if (rol === 'operador') return accion !== 'eliminar';
  if (rol === 'visual') return accion === 'ver' || accion === 'cargar';
  return false;
}

function traducirErrorAuth(error) {
  if (error.message.includes('Invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  return 'No se pudo iniciar sesión: ' + error.message;
}
