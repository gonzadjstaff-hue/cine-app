import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { Recompensa } from '../models/reward';

@Injectable({
    providedIn: 'root'
})
export class RewardsService {
    private readonly supabase = inject(SupabaseService);

    async listar(): Promise<Recompensa[]> {
        const { data, error } = await this.supabase.client
            .from('rewards')
            .select('id, nombre, product_id, es_entrada, costo_puntos')
            .eq('activo', true)
            .order('costo_puntos');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) => {
            const f = fila as Record<string, unknown>;
            return {
                id: f['id'] as string,
                nombre: f['nombre'] as string,
                productId: f['product_id'] as string | null,
                esEntrada: f['es_entrada'] as boolean,
                costoPuntos: f['costo_puntos'] as number
            };
        });
    }

    async canjearProducto(
        recompensa: Recompensa,
        precioUnit: number,
        userId: string,
        email: string
    ): Promise<number> {
        if (!recompensa.productId) {
            throw new Error('Esa recompensa no es un producto del candy bar');
        }

        const { data: orden, error: errorOrden } = await this.supabase.client
            .from('orders')
            .insert({ user_id: userId, email_contacto: email, estado: 'pendiente' })
            .select('id')
            .single();

        if (errorOrden) {
            throw new Error(errorOrden.message);
        }

        const { id } = orden as { id: string };

        const { error: errorItem } = await this.supabase.client.from('order_products').insert({
            order_id: id,
            product_id: recompensa.productId,
            cantidad: 1,
            precio_unit: precioUnit
        });

        if (errorItem) {
            await this.supabase.client.from('orders').delete().eq('id', id);
            throw new Error(errorItem.message);
        }

        const { data, error } = await this.supabase.client.rpc('canjear_recompensa', {
            p_order_id: id,
            p_reward_id: recompensa.id
        });

        if (error) {
            await this.supabase.client.from('orders').delete().eq('id', id);
            throw new Error(error.message);
        }

        const fila = ((data ?? []) as { puntos_restantes: number }[])[0];
        return Number(fila?.puntos_restantes ?? 0);
    }
}
