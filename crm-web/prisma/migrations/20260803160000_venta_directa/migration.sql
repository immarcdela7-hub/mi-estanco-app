-- Ventas directas: las que entran por notaxlost.com sin pasar por el QR de
-- nadie. Son ingreso nuestro entero y no se liquidan, pero tienen que constar
-- o la contabilidad no cuadra con lo que paga GetYourGuide.
--
-- La clave ajena NO cambia: sigue siendo RESTRICT. Que el campo admita nulos
-- no puede convertirse en que borrar un establecimiento pase sus ventas a
-- directas, porque eso borraria en silencio lo que le debemos.

-- AlterTable
ALTER TABLE "Sale" ALTER COLUMN "establishmentId" DROP NOT NULL;
