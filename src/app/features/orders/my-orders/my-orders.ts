import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { TicketsService } from '../../../core/services/tickets';
import { AuthService } from '../../../core/services/auth';
import { EntradaCompleta } from '../../../core/models/ticket';

@Component({
    selector: 'app-my-orders',
    imports: [CurrencyPipe],
    templateUrl: './my-orders.html',
    styleUrl: './my-orders.scss'
})
export class MyOrders implements OnInit {
    private readonly ticketsService = inject(TicketsService);
    private readonly auth = inject(AuthService);

    protected readonly compras = signal<EntradaCompleta[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);

    async ngOnInit(): Promise<void> {
        try {
            await this.auth.listo();
            const id = this.auth.perfil()?.id;

            if (id) {
                this.compras.set(await this.ticketsService.misCompras(id));
            }
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cargando.set(false);
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

    protected butacas(entrada: EntradaCompleta): string {
        return entrada.butacas.map((b) => `${b.fila}${b.numero}`).join(', ');
    }

    protected candy(entrada: EntradaCompleta): string {
        return entrada.productos.map((p) => `${p.cantidad}x ${p.nombre}`).join(', ');
    }

    protected async descargar(entrada: EntradaCompleta): Promise<void> {
        this.error.set(null);

        try {
            await this.ticketsService.descargarPdf(entrada);
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }
}
