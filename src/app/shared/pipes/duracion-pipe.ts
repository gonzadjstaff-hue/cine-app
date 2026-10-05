import { Pipe, PipeTransform } from '@angular/core';

// Convierte una duración en minutos a texto: 135 -> "2 h 15 min", 45 -> "45 min".
@Pipe({
    name: 'duracion'
})
export class DuracionPipe implements PipeTransform {
    transform(minutos: number | null | undefined): string {
        if (minutos == null) {
            return '';
        }

        const horas = Math.floor(minutos / 60);
        const resto = minutos % 60;
        return horas > 0 ? `${horas} h ${resto} min` : `${resto} min`;
    }
}
