import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatosPelicula, MoviesService } from '../../../core/services/movies';
import { AgeRating, Genre, Movie } from '../../../core/models/movie';

@Component({
    selector: 'app-movie-admin',
    imports: [ReactiveFormsModule],
    templateUrl: './movie-admin.html',
    styleUrl: './movie-admin.scss'
})
export class MovieAdmin {
    private readonly fb = inject(FormBuilder);
    private readonly moviesService = inject(MoviesService);

    protected readonly peliculas = signal<Movie[]>([]);
    protected readonly generos = signal<Genre[]>([]);
    protected readonly editando = signal<string | null>(null);
    protected readonly error = signal<string | null>(null);
    protected readonly enviando = signal(false);

    protected readonly clasificaciones: AgeRating[] = ['atp', 'plus13', 'plus18'];
    protected generosElegidos = new Set<string>();

    protected readonly formulario = this.fb.nonNullable.group({
        titulo: ['', Validators.required],
        poster_url: [''],
        duracion_min: [100, [Validators.required, Validators.min(1)]],
        sinopsis: ['', Validators.required],
        clasificacion: ['atp' as AgeRating, Validators.required],
        estado: ['cartelera' as Movie['estado'], Validators.required],
        fecha_estreno: ['', Validators.required],
        destacada_home: [false],
        preventa_activa: [false],
        preventa_inicio: [''],
        preventa_fin: [''],
        preventa_precio: [0]
    });

    constructor() {
        this.inicializar();
    }

    private async inicializar(): Promise<void> {
        try {
            this.generos.set(await this.moviesService.listarGeneros());
            await this.refrescar();
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }

    private async refrescar(): Promise<void> {
        this.peliculas.set(await this.moviesService.listarTodas());
    }

    protected etiquetaEdad(clasificacion: AgeRating): string {
        const etiquetas: Record<AgeRating, string> = {
            atp: 'ATP',
            plus13: '+13',
            plus18: '+18'
        };
        return etiquetas[clasificacion];
    }

    protected tieneGenero(id: string): boolean {
        return this.generosElegidos.has(id);
    }

    protected alternarGenero(id: string): void {
        if (this.generosElegidos.has(id)) {
            this.generosElegidos.delete(id);
        } else {
            this.generosElegidos.add(id);
        }
    }

    protected nuevo(): void {
        this.editando.set(null);
        this.generosElegidos = new Set();
        this.formulario.reset({
            titulo: '',
            poster_url: '',
            duracion_min: 100,
            sinopsis: '',
            clasificacion: 'atp',
            estado: 'cartelera',
            fecha_estreno: '',
            destacada_home: false,
            preventa_activa: false,
            preventa_inicio: '',
            preventa_fin: '',
            preventa_precio: 0
        });
    }

    protected editar(pelicula: Movie): void {
        this.editando.set(pelicula.id);
        this.generosElegidos = new Set(pelicula.generos.map((g) => g.id));
        this.formulario.setValue({
            titulo: pelicula.titulo,
            poster_url: pelicula.poster_url ?? '',
            duracion_min: pelicula.duracion_min,
            sinopsis: pelicula.sinopsis,
            clasificacion: pelicula.clasificacion,
            estado: pelicula.estado,
            fecha_estreno: pelicula.fecha_estreno,
            destacada_home: pelicula.destacada_home,
            preventa_activa: pelicula.preventa_activa,
            preventa_inicio: this.aFechaLocal(pelicula.preventa_inicio),
            preventa_fin: this.aFechaLocal(pelicula.preventa_fin),
            preventa_precio: pelicula.preventa_precio ?? 0
        });
    }

    protected async guardar(): Promise<void> {
        if (this.formulario.invalid) {
            this.formulario.markAllAsTouched();
            return;
        }

        this.enviando.set(true);
        this.error.set(null);

        const valores = this.formulario.getRawValue();
        const conPreventa =
            valores.preventa_activa &&
            valores.preventa_inicio &&
            valores.preventa_fin &&
            valores.preventa_precio > 0;

        if (valores.preventa_activa && !conPreventa) {
            this.error.set(
                'Para activar la preventa hay que indicar inicio, fin y precio especial.'
            );
            this.enviando.set(false);
            return;
        }

        const datos: DatosPelicula = {
            ...valores,
            poster_url: valores.poster_url.trim() || null,
            preventa_activa: !!conPreventa,
            preventa_inicio: conPreventa
                ? new Date(valores.preventa_inicio).toISOString()
                : null,
            preventa_fin: conPreventa ? new Date(valores.preventa_fin).toISOString() : null,
            preventa_precio: conPreventa ? valores.preventa_precio : null,
            generos: [...this.generosElegidos]
        };

        try {
            await this.moviesService.guardar(datos, this.editando() ?? undefined);
            await this.refrescar();
            this.nuevo();
        } catch (e) {
            this.error.set((e as Error).message);
        } finally {
            this.enviando.set(false);
        }
    }

    protected async eliminar(pelicula: Movie): Promise<void> {
        this.error.set(null);

        try {
            await this.moviesService.eliminar(pelicula.id);
            await this.refrescar();

            if (this.editando() === pelicula.id) {
                this.nuevo();
            }
        } catch (e) {
            this.error.set((e as Error).message);
        }
    }

    private aFechaLocal(iso: string | null): string {
        if (!iso) {
            return '';
        }

        const d = new Date(iso);
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    protected preventaActiva(): boolean {
        return this.formulario.controls.preventa_activa.value;
    }
}
