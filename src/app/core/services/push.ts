import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { SupabaseService } from './supabase';
import { environment } from '../../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class PushService {
    private readonly swPush = inject(SwPush);
    private readonly supabase = inject(SupabaseService);

    // El service worker solo se registra en el build de produccion,
    // asi que en `ng serve` las notificaciones no estan disponibles.
    disponible(): boolean {
        return this.swPush.isEnabled;
    }

    async suscribir(): Promise<void> {
        if (!this.disponible()) {
            throw new Error('Las notificaciones solo funcionan en la versión publicada de la app.');
        }

        let suscripcion: PushSubscription;

        try {
            suscripcion = await this.swPush.requestSubscription({
                serverPublicKey: environment.vapidPublicKey
            });
        } catch {
            throw new Error(
                'No diste permiso para las notificaciones. La alerta quedó guardada igual.'
            );
        }

        const { endpoint, keys } = suscripcion.toJSON();

        const { error } = await this.supabase.client.rpc('registrar_suscripcion_push', {
            p_endpoint: endpoint,
            p_p256dh: keys?.['p256dh'],
            p_auth: keys?.['auth']
        });

        if (error) {
            throw new Error(error.message);
        }
    }

    async notificarEstrenos(): Promise<{ enviadas: number; alertas: number }> {
        const { data, error } = await this.supabase.client.functions.invoke(
            'notificar-estrenos'
        );

        if (error) {
            throw new Error(error.message);
        }

        return data as { enviadas: number; alertas: number };
    }
}
