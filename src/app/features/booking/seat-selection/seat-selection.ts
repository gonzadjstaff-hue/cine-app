import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { BookingService } from '../../../core/services/booking';
import { AuthService } from '../../../core/services/auth';
import {
    ButacaEnMapa,
    DetalleFuncion,
    FilaDeMapa,
    ResultadoCompra,
    Seat
} from '../../../core/models/booking';

@Component({
    selector: 'app-seat-selection',
    imports: [RouterLink, CurrencyPipe],
    templateUrl: './seat-selection.html',
    styleUrl: './seat-selection.scss'
})
export class SeatSelection implements OnInit, OnDestroy {
    readonly id = input.required<string>();

    private readonly booking = inject(BookingService);
    protected readonly auth = inject(AuthService);

    private readonly sessionId = crypto.randomUUID();
    private butacas: Seat[] = [];
    private ocupadas = new Set<string>();
    private bloqueadas = new Set<string>();
    private canal: RealtimeChannel | null = null;
    private recargoVip = 0;
    private minutosBloqueo = 8;

    protected readonly funcion = signal<DetalleFuncion | null>(null);
    protected readonly filas = signal<FilaDeMapa[]>([]);
    protected readonly seleccion = signal<ButacaEnMapa[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);
    protected readonly comprando = signal(false);
    protected readonly compra = signal<ResultadoCompra | null>(null);
    protected readonly bloqueoEdad = signal<string | null>(null);

    ngOnInit(): void {
        this.cargar();
    }

    async ngOnDestroy(): Promise<void> {
        if (this.canal) {
            await this.booking.cerrarCanal(this.canal);
        }

        const f = this.funcion();

        if (f) {
            await this.booking.liberarTodas(f.id, this.sessionId);
        }
    }

    private async cargar(): Promise<void> {
        try {
            await this.auth.listo();

            const funcion = await this.booking.detalleFuncion(this.id());
            this.funcion.set(funcion);
            this.verificarEdad(funcion);

            [this.butacas, this.recargoVip, this.minutosBloqueo] = await Promise.all([
                this.booking.butacasDeSala(funcion.roomId),
                this.booking.recargoVip(),
                this.booking.minutosBloqueo()
            ]);

            await this.refrescarEstado();

            this.canal = this.booking.suscribir(funcion.id, () => {
                this.refrescarEstado();
            });
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cargando.set(false);
        }
    }

    private verificarEdad(funcion: DetalleFuncion): void {
        if (funcion.clasificacion === 'atp') {
            return;
        }

        const minima = funcion.clasificacion === 'plus13' ? 13 : 18;

        if (!this.auth.autenticado()) {
            this.bloqueoEdad.set(
                `Esta funcion es para mayores de ${minima} anos. Ingresa con tu cuenta para poder comprar.`
            );
            return;
        }

        const edad = this.auth.edad();

        if (edad !== null && edad < minima) {
            this.bloqueoEdad.set(
                `Esta funcion es para mayores de ${minima} anos y tu cuenta no cumple la edad requerida.`
            );
        }
    }

    private precioDe(butaca: Seat): number {
        const base = this.funcion()?.precio_base ?? 0;
        return butaca.tipo === 'vip'
            ? Math.round(base * (1 + this.recargoVip / 100))
            : base;
    }

    private async refrescarEstado(): Promise<void> {
        const funcion = this.funcion();

        if (!funcion) {
            return;
        }

        const [ocupadas, bloqueadas] = await Promise.all([
            this.booking.butacasOcupadas(funcion.id),
            this.booking.butacasBloqueadas(funcion.id, this.sessionId)
        ]);

        this.ocupadas = new Set(ocupadas);
        this.bloqueadas = new Set(bloqueadas);

        const elegidas = new Set(this.seleccion().map((b) => b.id));
        const perdidas = [...elegidas].filter((id) => this.ocupadas.has(id));

        if (perdidas.length) {
            this.seleccion.set(this.seleccion().filter((b) => !this.ocupadas.has(b.id)));
            this.error.set('Alguna butaca que habias elegido fue vendida.');
        }

        this.armarMapa();
    }

    private armarMapa(): void {
        const elegidas = new Set(this.seleccion().map((b) => b.id));
        const porFila = new Map<string, FilaDeMapa>();

        for (const butaca of this.butacas) {
            let fila = porFila.get(butaca.fila);

            if (!fila) {
                fila = { fila: butaca.fila, tipo: butaca.tipo, bloques: [[], [], []] };
                porFila.set(butaca.fila, fila);
            }

            fila.bloques[butaca.bloque - 1].push({
                ...butaca,
                ocupada: this.ocupadas.has(butaca.id),
                bloqueada: this.bloqueadas.has(butaca.id),
                seleccionada: elegidas.has(butaca.id),
                precio: this.precioDe(butaca)
            });
        }

        this.filas.set([...porFila.values()]);
    }

    protected async alternar(butaca: ButacaEnMapa): Promise<void> {
        if (butaca.ocupada || butaca.bloqueada || this.bloqueoEdad() || this.compra()) {
            return;
        }

        this.error.set(null);
        const funcion = this.funcion();

        if (!funcion) {
            return;
        }

        if (butaca.seleccionada) {
            await this.booking.liberar(funcion.id, butaca.id, this.sessionId);
            this.seleccion.set(this.seleccion().filter((b) => b.id !== butaca.id));
            await this.refrescarEstado();
            return;
        }

        const ok = await this.booking.bloquear(
            funcion.id,
            butaca.id,
            this.sessionId,
            this.auth.perfil()?.id ?? null,
            this.minutosBloqueo
        );

        if (!ok) {
            this.error.set('Esa butaca la esta eligiendo otra persona en este momento.');
            await this.refrescarEstado();
            return;
        }

        this.seleccion.set([...this.seleccion(), { ...butaca, seleccionada: true }]);
        await this.refrescarEstado();
    }

    protected total(): number {
        return this.seleccion().reduce((acc, b) => acc + b.precio, 0);
    }

    protected hayVip(): boolean {
        return this.seleccion().some((b) => b.tipo === 'vip');
    }

    protected etiqueta(butaca: ButacaEnMapa): string {
        return `${butaca.fila}${butaca.numero}`;
    }

    protected hora(iso: string): string {
        return new Date(iso).toLocaleString('es-AR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    protected async confirmar(): Promise<void> {
        const funcion = this.funcion();

        if (!funcion || this.seleccion().length === 0) {
            return;
        }

        const email = this.auth.perfil()?.email ?? 'anonimo@cineapp.local';

        this.comprando.set(true);
        this.error.set(null);

        try {
            const resultado = await this.booking.comprar(
                funcion.id,
                this.seleccion().map((b) => ({ id: b.id, precio: b.precio })),
                this.auth.perfil()?.id ?? null,
                email,
                this.sessionId
            );

            this.compra.set(resultado);
            this.seleccion.set([]);
            await this.refrescarEstado();
        } catch (e) {
            this.error.set((e as Error).message);
            await this.refrescarEstado();
        } finally {
            this.comprando.set(false);
        }
    }
}
