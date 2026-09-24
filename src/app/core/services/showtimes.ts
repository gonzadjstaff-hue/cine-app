import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import {
    DatosProgramacion,
    ResultadoProgramacion,
    Showtime
} from '../models/showtime';

interface RelacionCruda {
    id: string;
    inicio: string;
    fin: string;
    formato: Showtime['formato'];
    idioma: Showtime['idioma'];
    precio_base: number;
    activa: boolean;
    movies: { titulo: string } | { titulo: string }[] | null;
    rooms: { nombre: string } | { nombre: string }[] | null;
}

function primero<T>(valor: T | T[] | null): T | null {
    if (valor === null) {
        return null;
    }

    return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

@Injectable({
    providedIn: 'root'
})
export class ShowtimesService {
    private readonly supabase = inject(SupabaseService);

    async listarPorFecha(fecha: string): Promise<Showtime[]> {
        const desde = new Date(`${fecha}T00:00:00`);
        const hasta = new Date(desde);
        hasta.setDate(hasta.getDate() + 1);

        const { data, error } = await this.supabase.client
            .from('showtimes')
            .select(
                'id, inicio, fin, formato, idioma, precio_base, activa, movies(titulo), rooms(nombre)'
            )
            .gte('inicio', desde.toISOString())
            .lt('inicio', hasta.toISOString())
            .order('inicio');

        if (error) {
            throw new Error(error.message);
        }

        return ((data ?? []) as unknown as RelacionCruda[]).map((fila) => ({
            id: fila.id,
            inicio: fila.inicio,
            fin: fila.fin,
            formato: fila.formato,
            idioma: fila.idioma,
            precio_base: fila.precio_base,
            activa: fila.activa,
            pelicula: primero(fila.movies)?.titulo ?? '',
            sala: primero(fila.rooms)?.nombre ?? ''
        }));
    }

    async programar(datos: DatosProgramacion): Promise<ResultadoProgramacion> {
        const resultado: ResultadoProgramacion = { creadas: 0, rechazadas: [] };

        for (const hora of datos.horarios) {
            const inicio = new Date(`${datos.fecha}T${hora}:00`);

            const { error } = await this.supabase.client.rpc('asignar_sala', {
                p_movie_id: datos.movieId,
                p_inicio: inicio.toISOString(),
                p_formato: datos.formato,
                p_idioma: datos.idioma,
                p_precio: datos.precio
            });

            if (error) {
                resultado.rechazadas.push(hora);
            } else {
                resultado.creadas++;
            }
        }

        return resultado;
    }

    async eliminar(id: string): Promise<void> {
        const { error } = await this.supabase.client
            .from('showtimes')
            .delete()
            .eq('id', id);

        if (error) {
            throw new Error(error.message);
        }
    }
}
