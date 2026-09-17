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
  fecha_estreno: string;
  destacada_home: boolean;
  generos: Genre[];
}