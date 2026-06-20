import { IsInt, Min } from 'class-validator';

export class TopupDto {
  @IsInt()
  @Min(1)
  amountCents: number;
}
