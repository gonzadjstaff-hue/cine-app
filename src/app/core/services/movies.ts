import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { AgeRating, Genre, Movie, MovieStatus } from '../models/movie';

export interface DatosPelicula {
    titulo: string;
    poster_url: string | null;
    duracion_min: number;
    sinopsis: string;
    clasificacion: AgeRating;
    estado: MovieStatus;
    fecha_estreno: string;
    destacada_home: boolean;
    generos: string[];
}

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

    async listarTodas(): Promise<Movie[]> {
        const { data, error } = await this.supabase.client
            .from('movies')
            .select(CAMPOS_MOVIE)
            .order('titulo');

        if (error) {
            throw new Error(error.message);
        }

        return (data ?? []).map((fila) => ({
            ...fila,
            generos: fila.genres ?? []
        })) as unknown as Movie[];
    }

    async guardar(datos: DatosPelicula, id?: string): Promise<string> {
        const { generos, ...campos } = datos;

        const consulta = id
            ? this.supabase.client.from('movies').update(campos).eq('id', id).select('id').single()
            : this.supabase.client.from('movies').insert(campos).select('id').single();

        const { data, error } = await consulta;

        if (error) {
            throw new Error(error.message);
        }

        const movieId = (data as { id: string }).id;
        await this.reemplazarGeneros(movieId, generos);

        return movieId;
    }

    async eliminar(id: string): Promise<void> {
        const { error } = await this.supabase.client.from('movies').delete().eq('id', id);

        if (error) {
            throw new Error(error.message);
        }
    }

    private async reemplazarGeneros(movieId: string, generos: string[]): Promise<void> {
        await this.supabase.client.from('movie_genres').delete().eq('movie_id', movieId);

        if (generos.length === 0) {
            return;
        }

        const { error } = await this.supabase.client
            .from('movie_genres')
            .insert(generos.map((genre_id) => ({ movie_id: movieId, genre_id })));

        if (error) {
            throw new Error(error.message);
        }
    }
}
