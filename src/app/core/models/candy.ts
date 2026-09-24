export interface Producto {
    id: string;
    nombre: string;
    descripcion: string | null;
    precio: number;
    categoria: string;
}

export interface Combo {
    id: string;
    nombre: string;
    descripcion: string | null;
    precio: number;
    destacado: boolean;
}

export interface ItemDeCompra {
    productId: string | null;
    comboId: string | null;
    nombre: string;
    precioUnit: number;
    cantidad: number;
}
