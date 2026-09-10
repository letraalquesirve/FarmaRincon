// src/services/EmailService.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Devuelve las credenciales guardadas en este dispositivo, o null si
// falta alguna - el email queda "apagado" hasta que se configuren
// desde el modal de API Key (Brevo API Key + correo remitente).
const obtenerCredencialesBrevo = async () => {
  const [apiKey, senderEmail] = await Promise.all([
    AsyncStorage.getItem('brevo_api_key'),
    AsyncStorage.getItem('brevo_sender_email'),
  ]);
  if (!apiKey || !senderEmail) return null;
  return { apiKey, senderEmail };
};

// Envía un correo vía la API HTTP de Brevo (sin backend propio, igual
// que el push le pega directo a Expo). Devuelve { ok, motivo } - motivo
// solo viene cuando ok es false, con el detalle real del fallo.
export const enviarEmail = async (destinatarioEmail, asunto, cuerpoHtml) => {
  if (!destinatarioEmail) return { ok: false, motivo: 'Sin correo para este destinatario' };

  try {
    const credenciales = await obtenerCredencialesBrevo();
    if (!credenciales) {
      return { ok: false, motivo: 'Brevo no está configurado en este dispositivo (falta API Key o remitente)' };
    }

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': credenciales.apiKey,
      },
      body: JSON.stringify({
        sender: { name: 'FarmaRincón', email: credenciales.senderEmail },
        to: [{ email: destinatarioEmail }],
        subject: asunto,
        htmlContent: cuerpoHtml,
      }),
    });

    if (response.ok) return { ok: true };

    const errorBody = await response.json().catch(() => null);
    return { ok: false, motivo: errorBody?.message || `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, motivo: error?.message || String(error) };
  }
};
