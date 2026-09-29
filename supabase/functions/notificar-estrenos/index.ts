// Edge Function: notificar-estrenos
//
// Envia una notificacion push a cada usuario que activo la alerta de
// una pelicula que ya tiene funciones a la venta, y marca la alerta
// como notificada. Es idempotente: se puede llamar cuantas veces se
// quiera, solo procesa alertas pendientes.
//
// Secretos necesarios (Edge Functions > Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (opcional)

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function responder(cuerpo: unknown, estado = 200): Response {
    return new Response(JSON.stringify(cuerpo), {
        status: estado,
        headers: { ...CORS, 'Content-Type': 'application/json' }
    });
}

interface Alerta {
    movie_id: string;
    user_id: string;
}

interface Suscripcion {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS });
    }

    const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Solo un administrador puede disparar el envio.
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: sesion } = await admin.auth.getUser(token);

    if (!sesion?.user) {
        return responder({ error: 'No autenticado' }, 401);
    }

    const { data: perfil } = await admin
        .from('profiles')
        .select('rol')
        .eq('id', sesion.user.id)
        .single();

    if (perfil?.rol !== 'admin') {
        return responder({ error: 'Solo un administrador puede enviar avisos' }, 403);
    }

    // trim(): el campo de secretos del panel es multilinea y es facil
    // guardar la clave con un salto de linea al final.
    webpush.setVapidDetails(
        (Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@cine-app-five.vercel.app').trim(),
        (Deno.env.get('VAPID_PUBLIC_KEY') ?? '').trim(),
        (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').trim()
    );

    const { data: pendientes, error: errorAlertas } = await admin
        .from('release_alerts')
        .select('movie_id, user_id')
        .eq('notificado', false);

    if (errorAlertas) {
        return responder({ error: errorAlertas.message }, 500);
    }

    const alertas = (pendientes ?? []) as Alerta[];

    if (!alertas.length) {
        return responder({ enviadas: 0, alertas: 0 });
    }

    // "A la venta" = tiene al menos una funcion activa en el futuro.
    const peliculas = [...new Set(alertas.map((a) => a.movie_id))];

    const { data: funciones } = await admin
        .from('showtimes')
        .select('movie_id')
        .in('movie_id', peliculas)
        .eq('activa', true)
        .gt('inicio', new Date().toISOString());

    const aLaVenta = new Set((funciones ?? []).map((f) => f.movie_id as string));
    const listas = alertas.filter((a) => aLaVenta.has(a.movie_id));

    if (!listas.length) {
        return responder({ enviadas: 0, alertas: 0 });
    }

    const { data: titulos } = await admin
        .from('movies')
        .select('id, titulo')
        .in('id', [...aLaVenta]);

    const tituloDe = new Map((titulos ?? []).map((m) => [m.id as string, m.titulo as string]));

    const { data: subs } = await admin
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', [...new Set(listas.map((a) => a.user_id))]);

    const suscripciones = (subs ?? []) as Suscripcion[];
    const vencidas: string[] = [];
    let enviadas = 0;
    let alertasCumplidas = 0;

    for (const alerta of listas) {
        const destinos = suscripciones.filter((s) => s.user_id === alerta.user_id);
        let llego = false;

        // Formato que entiende el service worker de Angular (ngsw):
        // muestra la notificacion y al hacer clic abre la pelicula.
        const payload = JSON.stringify({
            notification: {
                title: '¡Ya están a la venta!',
                body: `Salieron las entradas de "${tituloDe.get(alerta.movie_id) ?? 'tu película'}".`,
                icon: '/icons/icon-192x192.png',
                data: {
                    onActionClick: {
                        default: {
                            operation: 'navigateLastFocusedOrOpen',
                            url: `/pelicula/${alerta.movie_id}`
                        }
                    }
                }
            }
        });

        for (const destino of destinos) {
            try {
                await webpush.sendNotification(
                    { endpoint: destino.endpoint, keys: { p256dh: destino.p256dh, auth: destino.auth } },
                    payload
                );
                enviadas++;
                llego = true;
            } catch (e) {
                const estado = (e as { statusCode?: number }).statusCode;

                // 404/410: el navegador dio de baja la suscripcion.
                if (estado === 404 || estado === 410) {
                    vencidas.push(destino.id);
                }
            }
        }

        // Si el usuario no tiene ningun navegador suscripto la alerta
        // queda pendiente: se le avisa cuando habilite las notificaciones.
        if (llego) {
            await admin
                .from('release_alerts')
                .update({ notificado: true })
                .eq('movie_id', alerta.movie_id)
                .eq('user_id', alerta.user_id);
            alertasCumplidas++;
        }
    }

    if (vencidas.length) {
        await admin.from('push_subscriptions').delete().in('id', vencidas);
    }

    return responder({ enviadas, alertas: alertasCumplidas });
});
