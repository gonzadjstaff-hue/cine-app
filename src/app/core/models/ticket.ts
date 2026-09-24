export interface EntradaButaca {
    fila: string;
    numero: number;
    tipo: 'normal' | 'accesible' | 'vip';
    precio: number;
    canjeada: boolean;
}

export interface EntradaCompleta {
    orderId: string;
    qr: string;
    total: number;
    fechaCompra: string;
    email: string;
    estado: 'pendiente' | 'pagada' | 'cancelada';
    pelicula: string;
    clasificacion: 'atp' | 'plus13' | 'plus18';
    inicio: string;
    sala: string;
    formato: string;
    idioma: string;
    butacas: EntradaButaca[];
}
