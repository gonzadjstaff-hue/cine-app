import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { UserRole } from '../models/profile';

export const rolGuard = (rolesPermitidos: UserRole[]): CanActivateFn => {
    return async () => {
        const auth = inject(AuthService);
        const router = inject(Router);

        await auth.listo();

        if (!auth.autenticado()) {
            return router.createUrlTree(['/ingresar']);
        }

        const rol = auth.rol();

        return rol !== null && rolesPermitidos.includes(rol)
            ? true
            : router.createUrlTree(['/cartelera']);
    };
};