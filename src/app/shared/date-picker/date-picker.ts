import {
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    Output,
    forwardRef,
    inject,
    signal
} from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

interface Celda {
    iso: string;
    dia: number;
    delMes: boolean;
    esHoy: boolean;
}

const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function aIso(anio: number, mes: number, dia: number): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${anio}-${p(mes + 1)}-${p(dia)}`;
}

// El cliente pidio explicitamente no usar el selector de fecha
// nativo del navegador (demasiado scroll, poco claro). Este
// componente lo reemplaza y se enchufa como cualquier control de
// Angular Forms via ControlValueAccessor.
@Component({
    selector: 'app-date-picker',
    imports: [FormsModule],
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
    private readonly host = inject(ElementRef<HTMLElement>);

    protected readonly abierto = signal(false);
    protected readonly valor = signal<string>('');
    protected readonly deshabilitado = signal(false);
    protected readonly vistaAnio = signal(new Date().getFullYear());
    protected readonly vistaMes = signal(new Date().getMonth());

    // API alternativa para usarlo fuera de un formulario reactivo
    // (p. ej. un filtro con [value] y (valueChange)).
    @Input()
    set value(valor: string) {
        this.writeValue(valor);
    }

    @Output()
    readonly valueChange = new EventEmitter<string>();

    private onChange: (valor: string) => void = () => {};
    private onTouched: () => void = () => {};

    @HostListener('document:click', ['$event'])
    protected alClickearFuera(evento: MouseEvent): void {
        if (this.abierto() && !this.host.nativeElement.contains(evento.target as Node)) {
            this.cerrar();
        }
    }

    writeValue(valor: string | null): void {
        this.valor.set(valor ?? '');

        if (valor) {
            const [anio, mes] = valor.split('-').map(Number);
            this.vistaAnio.set(anio);
            this.vistaMes.set(mes - 1);
        }
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

    protected alternar(): void {
        if (this.deshabilitado()) {
            return;
        }

        this.abierto() ? this.cerrar() : this.abrir();
    }

    private abrir(): void {
        if (this.valor()) {
            const [anio, mes] = this.valor().split('-').map(Number);
            this.vistaAnio.set(anio);
            this.vistaMes.set(mes - 1);
        }

        this.abierto.set(true);
    }

    private cerrar(): void {
        this.abierto.set(false);
        this.onTouched();
    }

    protected etiqueta(): string {
        if (!this.valor()) {
            return 'Elegir fecha';
        }

        const [anio, mes, dia] = this.valor().split('-').map(Number);
        return `${dia} de ${MESES[mes - 1]} de ${anio}`;
    }

    protected tituloMes(): string {
        return `${MESES[this.vistaMes()]} ${this.vistaAnio()}`;
    }

    protected readonly diasSemana = DIAS;
    protected readonly meses = MESES;

    protected anios(): number[] {
        const actual = new Date().getFullYear();
        const centro = this.vistaAnio();
        const desde = Math.min(centro, actual) - 90;
        const hasta = Math.max(centro, actual) + 10;
        const anios: number[] = [];

        for (let a = hasta; a >= desde; a--) {
            anios.push(a);
        }

        return anios;
    }

    protected irAMes(mes: number): void {
        this.vistaMes.set(Number(mes));
    }

    protected irAAnio(anio: number): void {
        this.vistaAnio.set(Number(anio));
    }

    protected celdas(): Celda[] {
        const anio = this.vistaAnio();
        const mes = this.vistaMes();
        const hoy = aIso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

        const primerDia = new Date(anio, mes, 1);
        // Lunes = 0 ... Domingo = 6, para que la grilla arranque en lunes.
        const offset = (primerDia.getDay() + 6) % 7;
        const diasEnMes = new Date(anio, mes + 1, 0).getDate();
        const diasMesAnterior = new Date(anio, mes, 0).getDate();

        const celdas: Celda[] = [];

        for (let i = offset; i > 0; i--) {
            const dia = diasMesAnterior - i + 1;
            const [a, m] = this.mesAnterior();
            celdas.push({ iso: aIso(a, m, dia), dia, delMes: false, esHoy: false });
        }

        for (let dia = 1; dia <= diasEnMes; dia++) {
            const iso = aIso(anio, mes, dia);
            celdas.push({ iso, dia, delMes: true, esHoy: iso === hoy });
        }

        let diaSiguiente = 1;
        while (celdas.length % 7 !== 0) {
            const [a, m] = this.mesSiguiente();
            celdas.push({
                iso: aIso(a, m, diaSiguiente),
                dia: diaSiguiente,
                delMes: false,
                esHoy: false
            });
            diaSiguiente++;
        }

        return celdas;
    }

    private mesAnterior(): [number, number] {
        return this.vistaMes() === 0
            ? [this.vistaAnio() - 1, 11]
            : [this.vistaAnio(), this.vistaMes() - 1];
    }

    private mesSiguiente(): [number, number] {
        return this.vistaMes() === 11
            ? [this.vistaAnio() + 1, 0]
            : [this.vistaAnio(), this.vistaMes() + 1];
    }

    protected irMesAnterior(): void {
        const [a, m] = this.mesAnterior();
        this.vistaAnio.set(a);
        this.vistaMes.set(m);
    }

    protected irMesSiguiente(): void {
        const [a, m] = this.mesSiguiente();
        this.vistaAnio.set(a);
        this.vistaMes.set(m);
    }

    protected elegir(celda: Celda): void {
        this.valor.set(celda.iso);
        this.onChange(celda.iso);
        this.onTouched();
        this.valueChange.emit(celda.iso);
        this.cerrar();

        if (!celda.delMes) {
            const [anio, mes] = celda.iso.split('-').map(Number);
            this.vistaAnio.set(anio);
            this.vistaMes.set(mes - 1);
        }
    }

    protected irHoy(): void {
        const hoy = new Date();
        this.elegir({
            iso: aIso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()),
            dia: hoy.getDate(),
            delMes: true,
            esHoy: true
        });
        this.vistaAnio.set(hoy.getFullYear());
        this.vistaMes.set(hoy.getMonth());
    }
}
