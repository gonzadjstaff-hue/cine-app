import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase';
import { DatosRegistro, Profile, UserRole } from '../models/profile';

// Supabase Auth responde en inglés; se traducen los casos que ve el usuario.
function traducirError(mensaje: string): string {
    const m = mensaje.toLowerCase();

    if (m.includes('invalid login credentials')) {
        return 'Email o contraseña incorrectos.';
    }

    if (m.includes('email not confirmed')) {
        return 'Todavía no confirmaste tu email. Revisá tu casilla (y la carpeta de spam).';
    }

    if (m.includes('already registered')) {
        return 'Ya existe una cuenta con ese email.';
    }

    if (m.includes('rate limit')) {
        return 'Se alcanzó el límite de mails de confirmación por hora. Probá de nuevo más tarde.';
    }

    return mensaje;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly supabase = inject(SupabaseService);
    private readonly inicializacion: Promise<void>;

    private readonly sesion = signal<Session | null>(null);

    readonly perfil = signal<Profile | null>(null);
    // Mensaje que muestra la barra al ingresar; se borra solo.
    readonly bienvenida = signal<string | null>(null);
    readonly autenticado = computed(() => this.sesion() !== null);
    readonly rol = computed<UserRole | null>(() => this.perfil()?.rol ?? null);
    readonly esAdmin = computed(() => this.rol() === 'admin');
    readonly esStaff = computed(() => this.rol() === 'admin' || this.rol() === 'empleado');
    readonly nombreCompleto = computed(() => {
        const p = this.perfil();
        return p ? `${p.nombre} ${p.apellido}`.trim() : '';
    });

    constructor() {
        this.inicializacion = this.inicializar();

        this.supabase.client.auth.onAuthStateChange((_evento, sesion) => {
            this.sesion.set(sesion);

            if (!sesion) {
                this.perfil.set(null);
                return;
            }

            setTimeout(() => this.cargarPerfil(sesion.user.id), 0);
        });
    }

    listo(): Promise<void> {
        return this.inicializacion;
    }

    private async inicializar(): Promise<void> {
        const { data } = await this.supabase.client.auth.getSession();
        this.sesion.set(data.session);

        if (data.session) {
            await this.cargarPerfil(data.session.user.id);
        }
    }

    private async cargarPerfil(id: string): Promise<void> {
        const { data, error } = await this.supabase.client
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        this.perfil.set(error ? null : (data as Profile));
    }

    async refrescarPerfil(): Promise<void> {
        const id = this.perfil()?.id;

        if (id) {
            await this.cargarPerfil(id);
        }
    }

    // Devuelve true si la cuenta quedó pendiente de confirmar por mail
    // (con "Confirm email" activo, signUp no devuelve sesión).
    async registrar(datos: DatosRegistro): Promise<boolean> {
        const { data, error } = await this.supabase.client.auth.signUp({
            email: datos.email,
            password: datos.password,
            options: {
                data: {
                    nombre: datos.nombre,
                    apellido: datos.apellido,
                    fecha_nacimiento: datos.fechaNacimiento
                }
            }
        });

        if (error) {
            throw new Error(traducirError(error.message));
        }

        return data.session === null;
    }

    async ingresar(email: string, password: string): Promise<void> {
        const { data, error } = await this.supabase.client.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw new Error(traducirError(error.message));
        }

        await this.cargarPerfil(data.user.id);

        const nombre = this.perfil()?.nombre;
        this.bienvenida.set(nombre ? `¡Bienvenido, ${nombre}!` : '¡Bienvenido!');
        setTimeout(() => this.bienvenida.set(null), 5000);
    }

    async salir(): Promise<void> {
        this.bienvenida.set(null);
        await this.supabase.client.auth.signOut();
    }

    edad(): number | null {
        const p = this.perfil();

        if (!p) {
            return null;
        }

        const nacimiento = new Date(p.fecha_nacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mes = hoy.getMonth() - nacimiento.getMonth();

        if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
            edad--;
        }

        return edad;
    }
}