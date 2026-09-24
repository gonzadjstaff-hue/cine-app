import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly router = inject(Router);

  protected readonly nombre = 'CineApp';
  protected readonly auth = inject(AuthService);

  protected async salir(): Promise<void> {
    await this.auth.salir();
    await this.router.navigate(['/cartelera']);
  }
}