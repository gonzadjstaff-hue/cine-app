import {
    AfterViewInit,
    Component,
    ElementRef,
    OnDestroy,
    OnInit,
    inject,
    signal,
    viewChild
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { ReportsService } from '../../../core/services/reports';
import { FilaFacturacion, FilaRanking } from '../../../core/models/report';

@Component({
    selector: 'app-reports',
    imports: [FormsModule, CurrencyPipe],
    templateUrl: './reports.html',
    styleUrl: './reports.scss'
})
export class Reports implements OnInit, AfterViewInit, OnDestroy {
    private readonly reportsService = inject(ReportsService);

    private readonly lienzoFacturacion =
        viewChild<ElementRef<HTMLCanvasElement>>('lienzoFacturacion');
    private readonly lienzoPeliculas =
        viewChild<ElementRef<HTMLCanvasElement>>('lienzoPeliculas');

    private graficoFacturacion: Chart | null = null;
    private graficoPeliculas: Chart | null = null;
    private vistaLista = false;

    protected desde = this.diasAtras(29);
    protected hasta = this.diasAtras(0);

    protected readonly facturacion = signal<FilaFacturacion[]>([]);
    protected readonly semana = signal<FilaRanking[]>([]);
    protected readonly mes = signal<FilaRanking[]>([]);
    protected readonly candy = signal<FilaRanking[]>([]);
    protected readonly cargando = signal(true);
    protected readonly error = signal<string | null>(null);

    private diasAtras(dias: number): string {
        const d = new Date();
        d.setDate(d.getDate() - dias);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    async ngOnInit(): Promise<void> {
        await this.cargar();
    }

    ngAfterViewInit(): void {
        this.vistaLista = true;
        this.dibujar();
    }

    ngOnDestroy(): void {
        this.graficoFacturacion?.destroy();
        this.graficoPeliculas?.destroy();
    }

    protected async cargar(): Promise<void> {
        this.cargando.set(true);
        this.error.set(null);

        const haceUnaSemana = new Date();
        haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);

        const haceUnMes = new Date();
        haceUnMes.setMonth(haceUnMes.getMonth() - 1);

        const resultados = await Promise.allSettled([
            this.reportsService.facturacion(this.desde, this.hasta),
            this.reportsService.peliculas(haceUnaSemana),
            this.reportsService.peliculas(haceUnMes),
            this.reportsService.candy()
        ]);

        const fallos: string[] = [];

        if (resultados[0].status === 'fulfilled') {
            this.facturacion.set(resultados[0].value);
        } else {
            fallos.push((resultados[0].reason as Error).message);
        }

        if (resultados[1].status === 'fulfilled') {
            this.semana.set(resultados[1].value);
        } else {
            fallos.push((resultados[1].reason as Error).message);
        }

        if (resultados[2].status === 'fulfilled') {
            this.mes.set(resultados[2].value);
        } else {
            fallos.push((resultados[2].reason as Error).message);
        }

        if (resultados[3].status === 'fulfilled') {
            this.candy.set(resultados[3].value);
        } else {
            fallos.push((resultados[3].reason as Error).message);
        }

        if (fallos.length) {
            this.error.set([...new Set(fallos)].join(' · '));
        }

        this.dibujar();
        this.cargando.set(false);
    }

    protected totalPeriodo(): number {
        return this.facturacion().reduce((acc, f) => acc + f.total, 0);
    }

    protected entradasPeriodo(): number {
        return this.facturacion().reduce((acc, f) => acc + f.entradas, 0);
    }

    protected masVendido(): FilaRanking | null {
        return this.candy()[0] ?? null;
    }

    protected diaCorto(iso: string): string {
        return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'short'
        });
    }

    private dibujar(): void {
        if (!this.vistaLista) {
            return;
        }

        const canvasFact = this.lienzoFacturacion()?.nativeElement;
        const canvasPeli = this.lienzoPeliculas()?.nativeElement;

        if (canvasFact) {
            this.graficoFacturacion?.destroy();
            this.graficoFacturacion = new Chart(canvasFact, {
                type: 'line',
                data: {
                    labels: this.facturacion().map((f) => this.diaCorto(f.dia)),
                    datasets: [
                        {
                            label: 'Entradas',
                            data: this.facturacion().map((f) => f.montoEntradas),
                            borderColor: '#d4183d',
                            backgroundColor: 'rgba(212, 24, 61, 0.12)',
                            fill: true,
                            tension: 0.3
                        },
                        {
                            label: 'Candy bar',
                            data: this.facturacion().map((f) => f.montoCandy),
                            borderColor: '#c08519',
                            backgroundColor: 'rgba(192, 133, 25, 0.12)',
                            fill: true,
                            tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        if (canvasPeli) {
            this.graficoPeliculas?.destroy();
            this.graficoPeliculas = new Chart(canvasPeli, {
                type: 'bar',
                data: {
                    labels: this.mes().map((f) => f.nombre),
                    datasets: [
                        {
                            label: 'Entradas del mes',
                            data: this.mes().map((f) => f.unidades),
                            backgroundColor: '#17141f'
                        }
                    ]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
                }
            });
        }
    }

    protected exportarExcel(): void {
        const libro = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            libro,
            XLSX.utils.json_to_sheet(
                this.facturacion().map((f) => ({
                    Dia: f.dia,
                    Entradas: f.entradas,
                    'Monto entradas': f.montoEntradas,
                    'Monto candy': f.montoCandy,
                    Total: f.total
                }))
            ),
            'Facturacion'
        );

        XLSX.utils.book_append_sheet(
            libro,
            XLSX.utils.json_to_sheet(
                this.mes().map((f) => ({
                    Pelicula: f.nombre,
                    Entradas: f.unidades,
                    Recaudado: f.monto
                }))
            ),
            'Peliculas del mes'
        );

        XLSX.utils.book_append_sheet(
            libro,
            XLSX.utils.json_to_sheet(
                this.candy().map((f) => ({
                    Producto: f.nombre,
                    Unidades: f.unidades,
                    Recaudado: f.monto
                }))
            ),
            'Candy bar'
        );

        XLSX.writeFile(libro, `reporte-${this.desde}-a-${this.hasta}.xlsx`);
    }

    protected exportarPdf(): void {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const pesos = (v: number) => `$ ${v.toLocaleString('es-AR')}`;

        doc.setFillColor(23, 20, 31);
        doc.rect(0, 0, 210, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text('CineApp - Reporte de facturaci\u00f3n', 20, 15);

        doc.setTextColor(23, 20, 31);
        doc.setFontSize(10);
        doc.text(`Per\u00edodo: ${this.desde} a ${this.hasta}`, 20, 34);
        doc.text(`Entradas vendidas: ${this.entradasPeriodo()}`, 20, 40);
        doc.text(`Facturaci\u00f3n total: ${pesos(this.totalPeriodo())}`, 20, 46);

        let y = 58;
        doc.setFontSize(11);
        doc.text('Detalle diario', 20, y);
        y += 7;

        doc.setFontSize(9);
        doc.text('D\u00eda', 20, y);
        doc.text('Entradas', 60, y, { align: 'right' });
        doc.text('Cine', 95, y, { align: 'right' });
        doc.text('Candy', 130, y, { align: 'right' });
        doc.text('Total', 165, y, { align: 'right' });
        y += 4;
        doc.line(20, y, 165, y);
        y += 5;

        for (const f of this.facturacion()) {
            if (f.total === 0) {
                continue;
            }

            if (y > 270) {
                doc.addPage();
                y = 25;
            }

            doc.text(f.dia, 20, y);
            doc.text(String(f.entradas), 60, y, { align: 'right' });
            doc.text(pesos(f.montoEntradas), 95, y, { align: 'right' });
            doc.text(pesos(f.montoCandy), 130, y, { align: 'right' });
            doc.text(pesos(f.total), 165, y, { align: 'right' });
            y += 5;
        }

        y += 8;

        if (y > 250) {
            doc.addPage();
            y = 25;
        }

        doc.setFontSize(11);
        doc.text('Pel\u00edculas m\u00e1s vistas del mes', 20, y);
        y += 7;
        doc.setFontSize(9);

        for (const f of this.mes()) {
            doc.text(f.nombre, 20, y);
            doc.text(`${f.unidades} entradas`, 100, y, { align: 'right' });
            doc.text(pesos(f.monto), 140, y, { align: 'right' });
            y += 5;
        }

        const top = this.masVendido();

        if (top) {
            y += 8;
            doc.setFontSize(11);
            doc.text('Producto m\u00e1s vendido del candy bar', 20, y);
            y += 7;
            doc.setFontSize(9);
            doc.text(`${top.nombre} - ${top.unidades} unidades - ${pesos(top.monto)}`, 20, y);
        }

        doc.save(`reporte-${this.desde}-a-${this.hasta}.pdf`);
    }
}
