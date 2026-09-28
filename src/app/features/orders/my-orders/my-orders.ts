import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { TicketsService } from '../../../core/services/tickets';
import { BookingService } from '../../../core/services/booking';
import { ProductsService } from '../../../core/services/products';
import { RewardsService } from '../../../core/services/rewards';
import { AuthService } from '../../../core/services/auth';
import { EntradaCompleta } from '../../../core/models/ticket';
import { Producto } from '../../../core/models/candy';
import { Recompensa } from '../../../core/models/reward';

interface RecompensaDeProducto {
    recompensa: Recompensa;
    producto: Producto;
}

@Component({
    selector: 'app-my-orders',
    imports: [CurrencyPipe],
    templateUrl: './my-orders.html',
    styleUrl: './my-orders.scss'
})
export class MyOrders implements OnInit {
    private readonly ticketsService = inject(TicketsService);
    private readonly booking = inject(BookingService);
    private readonly products = inject(ProductsService);
    private readonly rewardsService = inject(RewardsService);
    protected readonly auth = inject(AuthService);

    protected readonly compras = signal<EntradaCompleta[]>([]);
    protected readonly recompensasDeProducto = signal<RecompensaDeProducto[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);
    protected readonly aviso = signal<string | null>(null);
    protected readonly cancelando = signal<string | null>(null);
    protected readonly canjeando = signal<string | null>(null);

    async ngOnInit(): Promise<void> {
        try {
            await this.auth.listo();
            const id = this.auth.perfil()?.id;

            if (id) {
                const [compras, recompensas, productos] = await Promise.all([
                    this.ticketsService.misCompras(id),
                    this.rewardsService.listar(),
                    this.products.listarProductos()
                ]);

                this.compras.set(compras);
                this.recompensasDeProducto.set(
                    recompensas
                        .filter((r) => !r.esEntrada)
                        .map((r) => ({
                            recompensa: r,
                            producto: productos.find((p) => p.id === r.productId)
                        }))
                        .filter(
                            (r): r is RecompensaDeProducto => r.producto !== undefined
                        )
                );
            }
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cargando.set(false);
        }
    }

    protected puedeCanjear(costoPuntos: number): boolean {
        return (this.auth.perfil()?.puntos ?? 0) >= costoPuntos;
    }

    protected async canjearProducto(item: RecompensaDeProducto): Promise<void> {
        const perfil = this.auth.perfil();

        if (!perfil) {
            return;
        }

        this.error.set(null);
        this.aviso.set(null);
        this.canjeando.set(item.recompensa.id);

        try {
            await this.rewardsService.canjearProducto(
                item.recompensa,
                item.producto.precio,
                perfil.id,
                perfil.email
            );

            await this.auth.refrescarPerfil();

            const id = this.auth.perfil()?.id;

            if (id) {
                this.compras.set(await this.ticketsService.misCompras(id));
            }

            this.aviso.set(
                `Canjeaste ${item.producto.nombre}. Descargá el código de la compra para retirarlo en el candy bar.`
            );
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.canjeando.set(null);
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

    protected puedeCancelar(entrada: EntradaCompleta): boolean {
        if (entrada.estado !== 'pagada') {
            return false;
        }

        const inicio = new Date(entrada.inicio).getTime();
        return inicio - Date.now() > 2 * 60 * 60 * 1000;
    }

    protected async cancelar(entrada: EntradaCompleta): Promise<void> {
        this.error.set(null);
        this.aviso.set(null);
        this.cancelando.set(entrada.orderId);

        try {
            const credito = await this.booking.cancelar(entrada.orderId);
            await this.auth.refrescarPerfil();

            const id = this.auth.perfil()?.id;

            if (id) {
                this.compras.set(await this.ticketsService.misCompras(id));
            }

            this.aviso.set(
                `Compra cancelada. Se acreditaron $ ${credito.toLocaleString('es-AR')} a tu cuenta.`
            );
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.cancelando.set(null);
        }
    }
}
