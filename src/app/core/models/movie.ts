export type AgeRating = 'atp' | 'plus13' | 'plus18';
export type MovieStatus = 'cartelera' | 'proximamente' | 'archivada';

export interface Genre {
  id: string;
  nombre: string;
}

export interface Movie {
  id: string;
  titulo: string;
  poster_url: string | null;
  duracion_min: number;
  sinopsis: string;
  clasificacion: AgeRating;
  estado: MovieStatus;
  archivada: boolean;
  fecha_estreno: string;
  destacada_home: boolean;
  preventa_activa: boolean;
  preventa_inicio: string | null;
  preventa_fin: string | null;
  preventa_precio: number | null;
  generos: Genre[];
}