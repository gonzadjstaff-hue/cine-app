import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { Cupon, DatosCupon } from '../models/coupon';

const CAMPOS_CUPON =
    'id, codigo, descripcion, descuento_pct, primera_compra, edad_minima, valido_desde, valido_hasta, usos_maximos, usos_realizados, activo';

@Injectable({
    providedIn: 'root'
})
export class CouponsService {
    private readonly supabase = inject(SupabaseService);

    // La politica "cupones admin" deja ver tambien los inactivos.
    async listarTodos(): Promise<Cupon[]> {
        const { data, error } = await this.supabase.client
            .from('coupons')
            .select(CAMPOS_CUPON)
            .order('codigo');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []) as Cupon[];
    }

    async guardar(datos: DatosCupon, id?: string): Promise<void> {
        const campos = { ...datos, codigo: datos.codigo.trim().toUpperCase() };

        const { error } = id
            ? await this.supabase.client.from('coupons').update(campos).eq('id', id)
            : await this.supabase.client.from('coupons').insert(campos);

        if (error) {
            // 23505: violacion de unique sobre coupons.codigo
            throw new Error(
                error.code === '23505' ? 'Ya existe un cupón con ese código.' : error.message
            );
        }
    }

    // Baja logica: las compras que ya lo usaron conservan la referencia.
    async cambiarActivo(id: string, activo: boolean): Promise<void> {
        const { error } = await this.supabase.client
            .from('coupons')
            .update({ activo })
            .eq('id', id);

        if (error) {
            throw new Error(error.message);
        }
    }
}
