import {
    Component,
    EventEmitter,
    Input,
    Output,
    computed,
    forwardRef,
    signal
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

interface Atajo {
    iso: string;
    etiqueta: string;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function aIso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function desdeIso(iso: string): Date {
    const [anio, mes, dia] = iso.split('-').map(Number);
    return new Date(anio, mes - 1, dia);
}

// El cliente rechazo los calendarios desplegables porque obligan a
// buscar y scrollear. En su lugar: la fecha se escribe con mascara
// (dd/mm/aaaa, las barras se ponen solas) y, donde tiene sentido,
// se ofrecen atajos de un clic o flechas para pasar de dia en dia.
@Component({
    selector: 'app-date-picker',
    imports: [],
    templateUrl: './date-picker.html',
    styleUrl: './date-picker.scss',
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => DatePicker),
            multi: true
        }
    ]
})
export class DatePicker implements ControlValueAccessor {
    // Cantidad de dias proximos a ofrecer como atajo (0 = sin atajos).
    @Input() atajos = 0;

    // Flechas para mover la fecha de a un dia.
    @Input() flechas = false;

    @Input()
    set value(valor: string) {
        this.writeValue(valor);
    }

    @Output() readonly valueChange = new EventEmitter<string>();

    protected readonly texto = signal('');
    protected readonly valor = signal('');
    protected readonly invalida = signal(false);
    protected readonly deshabilitado = signal(false);

    protected readonly listaAtajos = computed<Atajo[]>(() => {
        const hoy = new Date();
        const lista: Atajo[] = [];

        for (let i = 0; i < this.atajos; i++) {
            const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
            const etiqueta =
                i === 0
                    ? 'Hoy'
                    : i === 1
                      ? 'Mañana'
                      : `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
            lista.push({ iso: aIso(d), etiqueta });
        }

        return lista;
    });

    private onChange: (valor: string) => void = () => {};
    private onTouched: () => void = () => {};

    writeValue(valor: string | null): void {
        const iso = valor ?? '';
        this.valor.set(iso);
        this.invalida.set(false);

        if (!iso) {
            this.texto.set('');
            return;
        }

        const [anio, mes, dia] = iso.split('-');
        this.texto.set(`${dia}/${mes}/${anio}`);
    }

    registerOnChange(fn: (valor: string) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(deshabilitado: boolean): void {
        this.deshabilitado.set(deshabilitado);
    }

    protected escribir(campo: HTMLInputElement): void {
        const digitos = campo.value.replace(/\D/g, '').slice(0, 8);
        let formateado = digitos.slice(0, 2);

        if (digitos.length > 2) {
            formateado += '/' + digitos.slice(2, 4);
        }

        if (digitos.length > 4) {
            formateado += '/' + digitos.slice(4);
        }

        campo.value = formateado;
        this.texto.set(formateado);

        if (digitos.length < 8) {
            this.invalida.set(false);
            this.emitir('');
            return;
        }

        const dia = Number(digitos.slice(0, 2));
        const mes = Number(digitos.slice(2, 4));
        const anio = Number(digitos.slice(4));
        const fecha = new Date(anio, mes - 1, dia);
        const existe =
            fecha.getFullYear() === anio &&
            fecha.getMonth() === mes - 1 &&
            fecha.getDate() === dia;

        this.invalida.set(!existe);
        this.emitir(existe ? aIso(fecha) : '');
    }

    protected elegir(iso: string): void {
        this.writeValue(iso);
        this.emitir(iso);
        this.onTouched();
    }

    protected mover(dias: number): void {
        const base = this.valor() ? desdeIso(this.valor()) : new Date();
        base.setDate(base.getDate() + dias);
        this.elegir(aIso(base));
    }

    protected tocar(): void {
        this.onTouched();
    }

    private emitir(iso: string): void {
        if (iso === this.valor()) {
            return;
        }

        this.valor.set(iso);
        this.onChange(iso);
        this.valueChange.emit(iso);
    }
}
