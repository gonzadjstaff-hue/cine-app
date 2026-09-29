import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatosPelicula, MoviesService } from '../../../core/services/movies';
import { AgeRating, Genre, Movie } from '../../../core/models/movie';
import { DatePicker } from '../../../shared/date-picker/date-picker';

@Component({
    selector: 'app-movie-admin',
    imports: [ReactiveFormsModule, DatePicker],
    templateUrl: './movie-admin.html',
    styleUrl: './movie-admin.scss'
})
export class MovieAdmin {
    private readonly fb = inject(FormBuilder);
    private readonly moviesService = inject(MoviesService);

    private diasPreventa = 7;

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
        archivada: [false],
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
            this.diasPreventa = await this.moviesService.diasPreventa();
            await this.refrescar();
        } catch (e) {
            this.error.set((e as Error).message);
        }

        this.formulario.controls.preventa_activa.valueChanges.subscribe((activa) => {
            if (activa) {
                this.sugerirVentanaPreventa();
            }
        });
    }

    // La consigna define la preventa como los dias previos al estreno
    // (configurable en app_config). Al activarla se propone esa ventana;
    // el admin puede ajustarla si necesita otra.
    private sugerirVentanaPreventa(): void {
        const c = this.formulario.controls;
        const estreno = c.fecha_estreno.value;

        if (!estreno || c.preventa_inicio.value || c.preventa_fin.value) {
            return;
        }

        // Del dia N antes del estreno hasta el dia anterior al estreno.
        const [anio, mes, dia] = estreno.split('-').map(Number);
        const inicio = new Date(anio, mes - 1, dia - this.diasPreventa);
        const fin = new Date(anio, mes - 1, dia - 1);

        c.preventa_inicio.setValue(this.aIso(inicio));
        c.preventa_fin.setValue(this.aIso(fin));
    }

    protected leyendaPreventa(): string {
        return `Ventana sugerida: ${this.diasPreventa} días antes del estreno (configurable en app_config).`;
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
            archivada: false,
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
            archivada: pelicula.archivada,
            fecha_estreno: pelicula.fecha_estreno,
            destacada_home: pelicula.destacada_home,
            preventa_activa: pelicula.preventa_activa,
            preventa_inicio: this.aFecha(pelicula.preventa_inicio),
            preventa_fin: this.aFecha(pelicula.preventa_fin, true),
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

        if (conPreventa && valores.preventa_fin < valores.preventa_inicio) {
            this.error.set('La preventa no puede terminar antes de empezar.');
            this.enviando.set(false);
            return;
        }

        // La ventana es por dia completo, en hora local: desde las 00:00
        // del primer dia hasta las 23:59 del ultimo.
        const datos: DatosPelicula = {
            ...valores,
            poster_url: valores.poster_url.trim() || null,
            preventa_activa: !!conPreventa,
            preventa_inicio: conPreventa
                ? new Date(`${valores.preventa_inicio}T00:00`).toISOString()
                : null,
            preventa_fin: conPreventa
                ? new Date(`${valores.preventa_fin}T23:59:59`).toISOString()
                : null,
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

    // esFin: las preventas cargadas antes de este cambio terminan justo a
    // las 00:00 del estreno; restando un segundo se muestra el dia anterior,
    // que es el ultimo dia real de la ventana.
    private aFecha(iso: string | null, esFin = false): string {
        if (!iso) {
            return '';
        }

        return this.aIso(new Date(new Date(iso).getTime() - (esFin ? 1000 : 0)));
    }

    private aIso(d: Date): string {
        const p = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // Misma regla que la funcion estado() de la base: se muestra
    // antes de guardar para que el admin sepa donde va a aparecer.
    protected destino(): string {
        const { fecha_estreno, archivada } = this.formulario.getRawValue();

        if (archivada) {
            return 'Archivada: no se muestra al público.';
        }

        if (!fecha_estreno) {
            return 'Con fecha futura va a Próximamente; desde el estreno, a Cartelera.';
        }

        const hoy = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        const hoyIso = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;

        return fecha_estreno > hoyIso
            ? 'Se va a mostrar en Próximamente y pasa sola a Cartelera el día del estreno.'
            : 'Se va a mostrar en Cartelera.';
    }

    protected preventaActiva(): boolean {
        return this.formulario.controls.preventa_activa.value;
    }
}
