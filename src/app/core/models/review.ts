export interface Review {
    id: string;
    userId: string;
    autor: string;
    estrellas: number;
    comentario: string | null;
    fecha: string;
}

export interface ResumenResenas {
    promedio: number | null;
    cantidad: number;
}
