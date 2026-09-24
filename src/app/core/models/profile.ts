export type UserRole = 'cliente' | 'empleado' | 'admin';

export interface Profile {
    id: string;
    email: string;
    nombre: string;
    apellido: string;
    fecha_nacimiento: string;
    tipo_sangre: string | null;
    color_ojos: string | null;
    dias_vacaciones: number | null;
    rol: UserRole;
    credito: number;
    puntos: number;
    primera_compra: boolean;
}

export interface DatosRegistro {
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    fechaNacimiento: string;
}
