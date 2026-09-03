import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export class UpdateLanguageDto {
  @IsNotEmpty({ message: 'Language is required' })
  @IsString({ message: 'Language must be a string' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsIn(SUPPORTED_LANGUAGES, {
    message: 'Invalid language. Supported languages are: fr, en, ar',
  })
  language!: SupportedLanguage;
}
