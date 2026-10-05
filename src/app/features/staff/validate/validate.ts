import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import jsQR from 'jsqr';
import { TicketsService } from '../../../core/services/tickets';
import { AuthService } from '../../../core/services/auth';
import { EntradaCompleta } from '../../../core/models/ticket';

@Component({
    selector: 'app-validate',
    imports: [FormsModule, CurrencyPipe],
    templateUrl: './validate.html',
    styleUrl: './validate.scss'
})
export class Validate implements OnDestroy {
    private readonly ticketsService = inject(TicketsService);
    private readonly auth = inject(AuthService);

    private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
    private readonly lienzo = document.createElement('canvas');
    private stream: MediaStream | null = null;
    private cuadro = 0;
    private destruido = false;

    protected readonly escaneando = signal(false);
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

    ngOnDestroy(): void {
        this.destruido = true;
        this.detenerCamara();
    }

    protected async escanear(): Promise<void> {
        if (this.escaneando()) {
            this.detenerCamara();
            return;
        }

        this.error.set(null);
        this.aviso.set(null);

        if (!navigator.mediaDevices?.getUserMedia) {
            this.error.set('Este navegador no permite usar la camara. Escribi el codigo a mano.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });

            if (this.destruido) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }

            this.stream = stream;
            this.escaneando.set(true);

            const video = this.video().nativeElement;
            video.srcObject = stream;
            await video.play();

            this.cuadro = requestAnimationFrame(() => this.leerCuadro());
        } catch (e) {
            this.detenerCamara();
            this.error.set(
                (e as Error).name === 'NotAllowedError'
                    ? 'Permiso de camara denegado. Habilitalo en el navegador o escribi el codigo a mano.'
                    : 'No se pudo abrir la camara. Escribi el codigo a mano.'
            );
        }
    }

    private leerCuadro(): void {
        if (!this.stream) {
            return;
        }

        const video = this.video().nativeElement;

        if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
            this.lienzo.width = video.videoWidth;
            this.lienzo.height = video.videoHeight;

            const ctx = this.lienzo.getContext('2d', { willReadFrequently: true });

            if (ctx) {
                ctx.drawImage(video, 0, 0);
                const imagen = ctx.getImageData(0, 0, this.lienzo.width, this.lienzo.height);
                const qr = jsQR(imagen.data, imagen.width, imagen.height, {
                    inversionAttempts: 'dontInvert'
                });

                if (qr?.data.trim()) {
                    this.detenerCamara();
                    this.codigo = qr.data.trim();
                    void this.buscar();
                    return;
                }
            }
        }

        this.cuadro = requestAnimationFrame(() => this.leerCuadro());
    }

    private detenerCamara(): void {
        cancelAnimationFrame(this.cuadro);
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.video().nativeElement.srcObject = null;
        this.escaneando.set(false);
    }

    protected limpiar(): void {
        this.detenerCamara();
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
