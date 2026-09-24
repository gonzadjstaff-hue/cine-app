import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase';
import {
    DetalleFuncion,
    FuncionDeCartelera,
    ResultadoCompra,
    Seat
} from '../models/booking';
import { ItemDeCompra } from '../models/candy';

function primero<T>(valor: T | T[] | null | undefined): T | null {
    if (valor === null || valor === undefined) {
        return null;
    }

    return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

@Injectable({
    providedIn: 'root'
})
export class BookingService {
    private readonly supabase = inject(SupabaseService);

    async funcionesDePelicula(movieId: string): Promise<FuncionDeCartelera[]> {
        const { data, error } = await this.supabase.client
            .from('showtimes')
            .select('id, inicio, formato, idioma, precio_base, rooms(nombre)')
            .eq('movie_id', movieId)
            .eq('activa', true)
            .gte('inicio', new Date().toISOString())
            .order('inicio');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) => {
            const f = fila as Record<string, unknown>;
            return {
                id: f['id'] as string,
                inicio: f['inicio'] as string,
                formato: f['formato'] as string,
                idioma: f['idioma'] as string,
                precio_base: f['precio_base'] as number,
                sala: primero(f['rooms'] as { nombre: string } | null)?.nombre ?? ''
            };
        });
    }

    async detalleFuncion(showtimeId: string): Promise<DetalleFuncion> {
        const { data, error } = await this.supabase.client
            .from('showtimes')
            .select(
                'id, inicio, fin, formato, idioma, precio_base, room_id, movie_id, rooms(nombre), movies(titulo, clasificacion, duracion_min)'
            )
            .eq('id', showtimeId)
            .single();

        if (error) {
            throw new Error(error.message);
        }

        const f = data as Record<string, unknown>;
        const sala = primero(f['rooms'] as { nombre: string } | null);
        const peli = primero(
            f['movies'] as
                | { titulo: string; clasificacion: DetalleFuncion['clasificacion']; duracion_min: number }
                | null
        );

        return {
            id: f['id'] as string,
            inicio: f['inicio'] as string,
            fin: f['fin'] as string,
            formato: f['formato'] as string,
            idioma: f['idioma'] as string,
            precio_base: f['precio_base'] as number,
            roomId: f['room_id'] as string,
            sala: sala?.nombre ?? '',
            movieId: f['movie_id'] as string,
            pelicula: peli?.titulo ?? '',
            clasificacion: peli?.clasificacion ?? 'atp',
            duracion_min: peli?.duracion_min ?? 0
        };
    }

    async butacasDeSala(roomId: string): Promise<Seat[]> {
        const { data, error } = await this.supabase.client
            .from('seats')
            .select('id, fila, bloque, numero, tipo')
            .eq('room_id', roomId)
            .order('fila')
            .order('bloque')
            .order('numero');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []) as Seat[];
    }

    async butacasOcupadas(showtimeId: string): Promise<string[]> {
        const { data, error } = await this.supabase.client.rpc('butacas_ocupadas', {
            p_showtime_id: showtimeId
        });

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as { seat_id: string }[]).map((f) => f.seat_id);
    }

    async butacasBloqueadas(showtimeId: string, sessionId: string): Promise<string[]> {
        const { data, error } = await this.supabase.client
            .from('seat_locks')
            .select('seat_id, session_id, expires_at')
            .eq('showtime_id', showtimeId)
            .gt('expires_at', new Date().toISOString());

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? [])
            .map((f) => f as { seat_id: string; session_id: string })
            .filter((f) => f.session_id !== sessionId)
            .map((f) => f.seat_id);
    }

    async bloquear(
        showtimeId: string,
        seatId: string,
        sessionId: string,
        userId: string | null,
        minutos: number
    ): Promise<boolean> {
        const expira = new Date(Date.now() + minutos * 60000).toISOString();

        const { error } = await this.supabase.client.from('seat_locks').insert({
            showtime_id: showtimeId,
            seat_id: seatId,
            session_id: sessionId,
            user_id: userId,
            expires_at: expira
        });

        return !error;
    }

    async liberar(showtimeId: string, seatId: string, sessionId: string): Promise<void> {
        await this.supabase.client
            .from('seat_locks')
            .delete()
            .eq('showtime_id', showtimeId)
            .eq('seat_id', seatId)
            .eq('session_id', sessionId);
    }

    async liberarTodas(showtimeId: string, sessionId: string): Promise<void> {
        await this.supabase.client
            .from('seat_locks')
            .delete()
            .eq('showtime_id', showtimeId)
            .eq('session_id', sessionId);
    }

    suscribir(showtimeId: string, alCambiar: () => void): RealtimeChannel {
        return this.supabase.client
            .channel(`funcion-${showtimeId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'seat_locks' },
                alCambiar
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'order_tickets' },
                alCambiar
            )
            .subscribe();
    }

    async cerrarCanal(canal: RealtimeChannel): Promise<void> {
        await this.supabase.client.removeChannel(canal);
    }

    async recargoVip(): Promise<number> {
        const { data } = await this.supabase.client
            .from('app_config')
            .select('valor')
            .eq('clave', 'recargo_vip_pct')
            .single();

        return Number((data as { valor: unknown } | null)?.valor ?? 0);
    }

    async minutosBloqueo(): Promise<number> {
        const { data } = await this.supabase.client
            .from('app_config')
            .select('valor')
            .eq('clave', 'minutos_bloqueo_butaca')
            .single();

        return Number((data as { valor: unknown } | null)?.valor ?? 8);
    }

    async comprar(
        showtimeId: string,
        butacas: { id: string; precio: number }[],
        items: ItemDeCompra[],
        userId: string | null,
        email: string,
        sessionId: string,
        codigoCupon: string | null,
        usarCredito: boolean
    ): Promise<ResultadoCompra> {
        const { data: orden, error: errorOrden } = await this.supabase.client
            .from('orders')
            .insert({
                user_id: userId,
                email_contacto: email,
                estado: 'pendiente'
            })
            .select('id, qr_codigo')
            .single();

        if (errorOrden) {
            throw new Error(errorOrden.message);
        }

        const { id, qr_codigo } = orden as { id: string; qr_codigo: string };

        const { error: errorTickets } = await this.supabase.client
            .from('order_tickets')
            .insert(
                butacas.map((b) => ({
                    order_id: id,
                    showtime_id: showtimeId,
                    seat_id: b.id,
                    precio: b.precio
                }))
            );

        if (errorTickets) {
            await this.supabase.client.from('orders').delete().eq('id', id);
            throw new Error(
                'Alguna de las butacas fue tomada por otra persona. Eleg\u00ed otras.'
            );
        }

        if (items.length) {
            const { error: errorItems } = await this.supabase.client
                .from('order_products')
                .insert(
                    items.map((i) => ({
                        order_id: id,
                        product_id: i.productId,
                        combo_id: i.comboId,
                        cantidad: i.cantidad,
                        precio_unit: i.precioUnit
                    }))
                );

            if (errorItems) {
                await this.supabase.client.from('orders').delete().eq('id', id);
                throw new Error(errorItems.message);
            }
        }

        const { data: cierre, error: errorCierre } = await this.supabase.client.rpc(
            'finalizar_compra',
            {
                p_order_id: id,
                p_codigo_cupon: codigoCupon,
                p_usar_credito: usarCredito
            }
        );

        if (errorCierre) {
            await this.supabase.client.from('orders').delete().eq('id', id);
            throw new Error(errorCierre.message);
        }

        const resumen = ((cierre ?? []) as {
            subtotal: number;
            descuento: number;
            credito_usado: number;
            total: number;
            pagado_real: number;
            puntos_ganados: number;
        }[])[0];

        await this.liberarTodas(showtimeId, sessionId);

        return {
            orderId: id,
            qr: qr_codigo,
            total: Number(resumen?.total ?? 0),
            descuento: Number(resumen?.descuento ?? 0),
            creditoUsado: Number(resumen?.credito_usado ?? 0),
            pagadoReal: Number(resumen?.pagado_real ?? 0),
            puntosGanados: Number(resumen?.puntos_ganados ?? 0)
        };
    }

    async cancelar(orderId: string): Promise<number> {
        const { data, error } = await this.supabase.client.rpc('cancelar_compra', {
            p_order_id: orderId
        });

        if (error) {
            throw new Error(error.message);
        }

        return Number(data ?? 0);
    }
}
