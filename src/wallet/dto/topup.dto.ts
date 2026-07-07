import { IsInt, Min } from 'class-validator';

// Bug 5: el controller usaba un tipo inline ({ amountCents: number }), que el
// ValidationPipe ignora por completo (no tiene metadata de class-validator).
// Fix: DTO como clase, con @IsInt() @Min(1) para rechazar montos negativos o cero.
export class TopupDto {
  @IsInt()
  @Min(1)
  amountCents: number;
}
