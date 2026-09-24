export type FilmFormat = '2D' | '3D' | '4D' | '5D';
export type LanguageType = 'castellano' | 'subtitulado';

export interface Showtime {
    id: string;
    inicio: string;
    fin: string;
    formato: FilmFormat;
    idioma: LanguageType;
    precio_base: number;
    activa: boolean;
    pelicula: string;
    sala: string;
}

export interface DatosProgramacion {
    movieId: string;
    fecha: string;
    horarios: string[];
    formato: FilmFormat;
    idioma: LanguageType;
    precio: number;
}

export interface ResultadoProgramacion {
    creadas: number;
    rechazadas: string[];
}
