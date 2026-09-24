import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TicketsService } from '../../../core/services/tickets';
import { AuthService } from '../../../core/services/auth';
import { EntradaCompleta } from '../../../core/models/ticket';

@Component({
    selector: 'app-validate',
    imports: [FormsModule, CurrencyPipe],
    templateUrl: './validate.html',
    styleUrl: './validate.scss'
})
export class Validate {
    private readonly ticketsService = inject(TicketsService);
    private readonly auth = inject(AuthService);

    protected codigo = '';
    protected readonly entrada = signal<EntradaCompleta | null>(null);
    protected readonly error = signal<string | null>(null);
    protected readonly aviso = signal<string | null>(null);
    protected readonly buscando = signal(false);
    protected readonly canjeando = signal(false);

    protected async buscar(): Promise<void> {
        if (!this.codigo.trim()) {
            return;
        }

        this.buscando.set(true);
        this.error.set(null);
        this.aviso.set(null);
        this.entrada.set(null);

        try {
            const encontrada = await this.ticketsService.porCodigo(this.codigo);

            if (!encontrada) {
                this.error.set('No existe ninguna compra con ese codigo.');
                return;
            }

            this.entrada.set(encontrada);
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.buscando.set(false);
        }
    }

    protected limpiar(): void {
        this.codigo = '';
        this.entrada.set(null);
        this.error.set(null);
        this.aviso.set(null);
    }

    protected todasCanjeadas(entrada: EntradaCompleta): boolean {
        return entrada.butacas.every((b) => b.canjeada);
    }

    protected puedeIngresar(entrada: EntradaCompleta): boolean {
        return entrada.estado === 'pagada' && !this.todasCanjeadas(entrada);
    }

    protected candyPendiente(entrada: EntradaCompleta): boolean {
        return (
            entrada.estado === 'pagada' &&
            entrada.productos.some((p) => !p.canjeado)
        );
    }

    protected async entregarCandy(): Promise<void> {
        const entrada = this.entrada();
        const empleado = this.auth.perfil()?.id;

        if (!entrada || !empleado) {
            return;
        }

        this.canjeando.set(true);
        this.error.set(null);

        try {
            await this.ticketsService.canjearProductos(entrada.orderId, empleado);
            this.entrada.set(await this.ticketsService.porId(entrada.orderId));
            this.aviso.set('Candy entregado.');
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.canjeando.set(false);
        }
    }

    protected fecha(iso: string): string {
        return new Date(iso).toLocaleString('es-AR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    protected async canjear(): Promise<void> {
        const entrada = this.entrada();
        const empleado = this.auth.perfil()?.id;

        if (!entrada || !empleado) {
            return;
        }

        this.canjeando.set(true);
        this.error.set(null);

        try {
            await this.ticketsService.canjearEntradas(entrada.orderId, empleado);
            this.entrada.set(await this.ticketsService.porId(entrada.orderId));
            this.aviso.set('Entradas validadas. Puede ingresar a la sala.');
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.canjeando.set(false);
        }
    }
}
