import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';

// Si la imagen del póster no carga, la reemplaza por un recuadro con la inicial del título.
// Uso: <img [src]="p.poster_url" [appPosterRespaldo]="p.titulo" />
@Directive({
    selector: 'img[appPosterRespaldo]'
})
export class PosterRespaldo {
    readonly titulo = input('', { alias: 'appPosterRespaldo' });

    private readonly img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;

    @HostListener('error')
    protected alFallar(): void {
        // Si lo que falló es el propio respaldo, no se vuelve a intentar.
        if (this.img.src.startsWith('data:image/svg+xml')) {
            return;
        }

        const estilos = getComputedStyle(this.img);
        const fondo = estilos.getPropertyValue('--tinta-2').trim() || '#333';
        const texto = estilos.getPropertyValue('--superficie').trim() || '#fff';
        const inicial = this.titulo().trim().charAt(0).toUpperCase() || '?';

        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">` +
            `<rect width="200" height="300" fill="${fondo}"/>` +
            `<text x="100" y="150" font-family="sans-serif" font-size="90" fill="${texto}" ` +
            `text-anchor="middle" dominant-baseline="central">${this.escapar(inicial)}</text>` +
            `</svg>`;

        this.img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }

    private escapar(texto: string): string {
        return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
