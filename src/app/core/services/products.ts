import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { Combo, Producto } from '../models/candy';

function primero<T>(valor: T | T[] | null | undefined): T | null {
    if (valor === null || valor === undefined) {
        return null;
    }

    return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

@Injectable({
    providedIn: 'root'
})
export class ProductsService {
    private readonly supabase = inject(SupabaseService);

    async listarProductos(): Promise<Producto[]> {
        const { data, error } = await this.supabase.client
            .from('products')
            .select('id, nombre, descripcion, precio, product_categories(nombre)')
            .eq('activo', true)
            .order('nombre');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) => {
            const f = fila as Record<string, unknown>;
            return {
                id: f['id'] as string,
                nombre: f['nombre'] as string,
                descripcion: f['descripcion'] as string | null,
                precio: f['precio'] as number,
                categoria:
                    primero<{ nombre: string }>(
                        f['product_categories'] as { nombre: string } | null
                    )?.nombre ?? 'Otros'
            };
        });
    }

    async listarCombos(): Promise<Combo[]> {
        const { data, error } = await this.supabase.client
            .from('combos')
            .select('id, nombre, descripcion, precio, destacado')
            .eq('activo', true)
            .order('destacado', { ascending: false })
            .order('precio');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []) as unknown as Combo[];
    }
}
