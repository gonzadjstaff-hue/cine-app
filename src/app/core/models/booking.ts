export type SeatType = 'normal' | 'accesible' | 'vip';

export interface Seat {
    id: string;
    fila: string;
    bloque: number;
    numero: number;
    tipo: SeatType;
}

export interface ButacaEnMapa extends Seat {
    ocupada: boolean;
    bloqueada: boolean;
    seleccionada: boolean;
    precio: number;
}

export interface FilaDeMapa {
    fila: string;
    tipo: SeatType;
    bloques: ButacaEnMapa[][];
}

export interface DetalleFuncion {
    id: string;
    inicio: string;
    fin: string;
    formato: string;
    idioma: string;
    precio_base: number;
    roomId: string;
    sala: string;
    movieId: string;
    pelicula: string;
    clasificacion: 'atp' | 'plus13' | 'plus18';
    duracion_min: number;
}

export interface FuncionDeCartelera {
    id: string;
    inicio: string;
    formato: string;
    idioma: string;
    precio_base: number;
    sala: string;
}

export interface ResultadoCompra {
    orderId: string;
    qr: string;
    total: number;
}
