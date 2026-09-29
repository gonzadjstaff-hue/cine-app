-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 16: ABM de cupones
-- ============================================================

-- El porcentaje de primera compra estaba duplicado: en app_config
-- (cupon_primera_compra_pct) y en el cupon BIENVENIDO. finalizar_compra
-- y validar_cupon siempre usaron el del cupon, asi que ese queda como
-- unica fuente y se edita desde la pantalla de cupones del admin.
delete from app_config where clave = 'cupon_primera_compra_pct';

-- La politica "cupones admin" (002_rls.sql) ya permite al admin crear,
-- editar y ver cupones inactivos; no hace falta tocar RLS.
