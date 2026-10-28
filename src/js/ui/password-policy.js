/**
 * password-policy.js — Política de contraseñas compartida por el registro
 * (login-modal.js) y el cambio de contraseña (account.js).
 *
 * La validación del cliente no sustituye la política de contraseñas de
 * Firebase Authentication; ambas deben coincidir.
 */

/* Contraseñas comunes prohibidas (en minúsculas) */
const PASSWORDS_PROHIBIDAS = [
  "password", "contraseña", "123456", "12345678", "123456789", "1234567890",
  "qwerty", "abc123", "mariru", "marirubasar", "marirutienda",
];

/** Devuelve la lista de requisitos que la contraseña no cumple. */
export function evaluarFortaleza(pass, email, nombre) {
  const errores = [];
  if (pass.length < 12) errores.push("mínimo 12 caracteres");
  if (!/[A-Z]/.test(pass)) errores.push("una mayúscula");
  if (!/[a-z]/.test(pass)) errores.push("una minúscula");
  if (!/[0-9]/.test(pass)) errores.push("un número");
  if (!/[^A-Za-z0-9]/.test(pass)) errores.push("un símbolo (!@#$…)");

  const passLower = pass.toLowerCase();
  const emailUsuario = (email || "").split("@")[0].toLowerCase();
  if (PASSWORDS_PROHIBIDAS.includes(passLower)) errores.push("no uses contraseñas comunes");
  if (emailUsuario && passLower.includes(emailUsuario)) errores.push("no incluyas tu correo");
  if (nombre && passLower.includes(nombre.toLowerCase())) errores.push("no incluyas tu nombre");
  if (/^(\d{2}[\/_-]?\d{2}[\/_-]?\d{2,4}|19\d{2}|20\d{2})/.test(pass)) errores.push("no uses fechas de cumpleaños");

  return errores;
}
