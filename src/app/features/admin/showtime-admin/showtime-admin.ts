import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MoviesService } from '../../../core/services/movies';
import { ShowtimesService } from '../../../core/services/showtimes';
import { Movie } from '../../../core/models/movie';
import { FilmFormat, LanguageType, Showtime } from '../../../core/models/showtime';

@Component({
    selector: 'app-showtime-admin',
    imports: [ReactiveFormsModule],
    templateUrl: './showtime-admin.html',
    styleUrl: './showtime-admin.scss'
})
export class ShowtimeAdmin {
    private readonly fb = inject(FormBuilder);
    private readonly moviesService = inject(MoviesService);
    private readonly showtimesService = inject(ShowtimesService);

    protected readonly peliculas = signal<Movie[]>([]);
    protected readonly funciones = signal<Showtime[]>([]);
    protected readonly error = signal<string | null>(null);
    protected readonly aviso = signal<string | null>(null);
    protected readonly enviando = signal(false);

    protected readonly formatos: FilmFormat[] = ['2D', '3D', '4D', '5D'];
    protected readonly idiomas: LanguageType[] = ['castellano', 'subtitulado'];
    protected readonly horariosSugeridos = [
        '12:00', '14:00', '16:00', '17:30', '19:00', '20:30', '22:00', '23:30'
    ];

    protected horariosElegidos = new Set<string>();

    protected readonly formulario = this.fb.nonNullable.group({
        movieId: ['', Validators.required],
        fecha: [this.hoy(), Validators.required],
        formato: ['2D' as FilmFormat, Validators.required],
        idioma: ['castellano' as LanguageType, Validators.required],
        precio: [5500, [Validators.required, Validators.min(0)]]
    });

    protected readonly fechaListado = signal(this.hoy());

    constructor() {
        this.inicializar();
    }

    private hoy(): string {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    private async inicializar(): Promise<void> {
        try {
            this.peliculas.set(await this.moviesService.listarTodas());
            await this.refrescar();
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }

    protected async refrescar(): Promise<void> {
        try {
            this.funciones.set(
                await this.showtimesService.listarPorFecha(this.fechaListado())
            );
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }

    protected cambiarFecha(valor: string): void {
        this.fechaListado.set(valor);
        this.refrescar();
    }

    protected tieneHorario(hora: string): boolean {
        return this.horariosElegidos.has(hora);
    }

    protected alternarHorario(hora: string): void {
        if (this.horariosElegidos.has(hora)) {
            this.horariosElegidos.delete(hora);
        } else {
            this.horariosElegidos.add(hora);
        }
    }

    protected hora(iso: string): string {
        return new Date(iso).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    protected async programar(): Promise<void> {
        if (this.formulario.invalid || this.horariosElegidos.size === 0) {
            this.formulario.markAllAsTouched();
            this.error.set('Eleg\u00ed una pel\u00edcula y al menos un horario.');
            return;
        }

        this.enviando.set(true);
        this.error.set(null);
        this.aviso.set(null);

        const valores = this.formulario.getRawValue();

        try {
            const resultado = await this.showtimesService.programar({
                ...valores,
                horarios: [...this.horariosElegidos].sort()
            });

            const partes = [`${resultado.creadas} funciones programadas`];

            if (resultado.rechazadas.length) {
                partes.push(
                    `sin sala libre en: ${resultado.rechazadas.join(', ')}`
                );
            }

            this.aviso.set(partes.join(' \u00b7 '));
            this.fechaListado.set(valores.fecha);
            await this.refrescar();
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.enviando.set(false);
        }
    }

    protected async eliminar(funcion: Showtime): Promise<void> {
        this.error.set(null);

        try {
            await this.showtimesService.eliminar(funcion.id);
            await this.refrescar();
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }
}
