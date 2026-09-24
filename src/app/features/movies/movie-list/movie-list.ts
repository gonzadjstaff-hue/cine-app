import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MoviesService } from '../../../core/services/movies';
import { AgeRating, Genre, Movie } from '../../../core/models/movie';

@Component({
  selector: 'app-movie-list',
  imports: [FormsModule, RouterLink],
  templateUrl: './movie-list.html',
  styleUrl: './movie-list.scss'
})
export class MovieList {
  private readonly moviesService = inject(MoviesService);

  protected readonly peliculas = signal<Movie[]>([]);
  protected readonly generos = signal<Genre[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected texto = '';
  protected generoId = '';

  constructor() {
    this.inicializar();
  }

  private async inicializar(): Promise<void> {
    try {
      this.generos.set(await this.moviesService.listarGeneros());
    } catch (e) {
      this.error.set((e as Error).message);
    }

    await this.buscar();
  }

  protected async buscar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);

    try {
      const resultado = await this.moviesService.listarCartelera({
        texto: this.texto.trim() || undefined,
        generoId: this.generoId || undefined
      });
      this.peliculas.set(resultado);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.cargando.set(false);
    }
  }

  protected limpiar(): void {
    this.texto = '';
    this.generoId = '';
    this.buscar();
  }

  protected etiquetaEdad(clasificacion: AgeRating): string {
    const etiquetas: Record<AgeRating, string> = {
      atp: 'ATP',
      plus13: '+13',
      plus18: '+18'
    };
    return etiquetas[clasificacion];
  }

  protected duracion(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return horas > 0 ? `${horas} h ${resto} min` : `${resto} min`;
  }
}