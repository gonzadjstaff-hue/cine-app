export interface Cupon {
    id: string;
    codigo: string;
    descripcion: string | null;
    descuento_pct: number;
    primera_compra: boolean;
    edad_minima: number | null;
    valido_desde: string | null;
    valido_hasta: string | null;
    usos_maximos: number | null;
    usos_realizados: number;
    activo: boolean;
}

export type DatosCupon = Omit<Cupon, 'id' | 'usos_realizados'>;
