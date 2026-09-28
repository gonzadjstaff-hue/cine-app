import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';

export interface Actividad {
    id: string;
    accion: string;
    entidad: string | null;
    entidadId: string | null;
    detalle: Record<string, unknown> | null;
    fecha: string;
    usuario: string;
}

function primero<T>(valor: T | T[] | null | undefined): T | null {
    if (valor === null || valor === undefined) {
        return null;
    }

    return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

@Injectable({
    providedIn: 'root'
})
export class ActivityService {
    private readonly supabase = inject(SupabaseService);

    async listar(limite = 100): Promise<Actividad[]> {
        const { data, error } = await this.supabase.client
            .from('activity_log')
            .select('id, accion, entidad, entidad_id, detalle, created_at, profiles(nombre, apellido)')
            .order('created_at', { ascending: false })
            .limit(limite);

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) => {
            const f = fila as Record<string, unknown>;
            const perfil = primero(
                f['profiles'] as { nombre: string; apellido: string } | null
            );

            return {
                id: f['id'] as string,
                accion: f['accion'] as string,
                entidad: f['entidad'] as string | null,
                entidadId: f['entidad_id'] as string | null,
                detalle: f['detalle'] as Record<string, unknown> | null,
                fecha: f['created_at'] as string,
                usuario: perfil
                    ? `${perfil.nombre} ${perfil.apellido}`.trim()
                    : 'Sistema'
            };
        });
    }
}
