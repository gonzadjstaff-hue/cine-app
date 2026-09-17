import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { Genre, Movie } from '../models/movie';

export interface FiltroCartelera {
    texto?: string;
    generoId?: string;
}

const CAMPOS_MOVIE =
    'id, titulo, poster_url, duracion_min, sinopsis, clasificacion, estado, fecha_estreno, destacada_home, genres(id, nombre)';

@Injectable({
    providedIn: 'root'
})
export class MoviesService {
    private readonly supabase = inject(SupabaseService);

    async listarGeneros(): Promise<Genre[]> {
        const { data, error } = await this.supabase.client
            .from('genres')
            .select('id, nombre')
            .order('nombre');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []) as Genre[];
    }

    async listarCartelera(filtro: FiltroCartelera = {}): Promise<Movie[]> {
        let idsPorGenero: string[] | null = null;

        if (filtro.generoId) {
            const { data, error } = await this.supabase.client
                .from('movie_genres')
                .select('movie_id')
                .eq('genre_id', filtro.generoId);

            if (error) {
                throw new Error(error.message);
            }

            idsPorGenero = (data ?? []).map((fila) => fila.movie_id as string);

            if (idsPorGenero.length === 0) {
                return [];
            }
        }

        let consulta = this.supabase.client
            .from('movies')
            .select(CAMPOS_MOVIE)
            .eq('estado', 'cartelera')
            .order('titulo');

        if (filtro.texto) {
            consulta = consulta.ilike('titulo', `%${filtro.texto}%`);
        }

        if (idsPorGenero) {
            consulta = consulta.in('id', idsPorGenero);
        }

        const { data, error } = await consulta;

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) => ({
            ...fila,
            generos: fila.genres ?? []
        })) as unknown as Movie[];
    }
}