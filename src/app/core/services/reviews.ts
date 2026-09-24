import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { ResumenResenas, Review } from '../models/review';

function primero<T>(valor: T | T[] | null | undefined): T | null {
    if (valor === null || valor === undefined) {
        return null;
    }

    return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

@Injectable({
    providedIn: 'root'
})
export class ReviewsService {
    private readonly supabase = inject(SupabaseService);

    async listar(movieId: string): Promise<Review[]> {
        const { data, error } = await this.supabase.client
            .from('reviews')
            .select('id, user_id, estrellas, comentario, created_at, profiles(nombre, apellido)')
            .eq('movie_id', movieId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) => {
            const f = fila as Record<string, unknown>;
            const perfil = primero<{ nombre: string; apellido: string }>(
                f['profiles'] as { nombre: string; apellido: string } | null
            );

            return {
                id: f['id'] as string,
                userId: f['user_id'] as string,
                autor: perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : 'Espectador',
                estrellas: f['estrellas'] as number,
                comentario: f['comentario'] as string | null,
                fecha: f['created_at'] as string
            };
        });
    }

    async resumen(movieId: string): Promise<ResumenResenas> {
        const { data, error } = await this.supabase.client.rpc('promedio_resenas', {
            p_movie_id: movieId
        });

        if (error) {
            throw new Error(error.message);
        }

        const fila = ((data ?? []) as { promedio: number | null; cantidad: number }[])[0];

        return {
            promedio: fila?.promedio ?? null,
            cantidad: Number(fila?.cantidad ?? 0)
        };
    }

    async guardar(
        movieId: string,
        userId: string,
        estrellas: number,
        comentario: string
    ): Promise<void> {
        const { error } = await this.supabase.client.from('reviews').upsert(
            {
                movie_id: movieId,
                user_id: userId,
                estrellas,
                comentario: comentario.trim() || null
            },
            { onConflict: 'movie_id,user_id' }
        );

        if (error) {
            throw new Error(error.message);
        }
    }

    async borrar(movieId: string, userId: string): Promise<void> {
        const { error } = await this.supabase.client
            .from('reviews')
            .delete()
            .eq('movie_id', movieId)
            .eq('user_id', userId);

        if (error) {
            throw new Error(error.message);
        }
    }
}
