import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewRecommendationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
