import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token returned by Google Identity Services',
  })
  @IsString()
  idToken: string;

  @ApiPropertyOptional({
    description:
      'Optional Google OAuth client ID. Server GOOGLE_CLIENT_ID/GOOGLE_CLIENT_IDS is preferred.',
  })
  @IsOptional()
  @IsString()
  clientId?: string;
}
