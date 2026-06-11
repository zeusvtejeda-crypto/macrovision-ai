import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleMobileDto {
  @ApiProperty({ description: 'ID token de Google Sign-In' })
  @IsString()
  idToken: string;
}

export class AppleMobileDto {
  @ApiProperty({ description: 'Identity token de Apple Sign In' })
  @IsString()
  identityToken: string;

  @ApiProperty()
  @IsString()
  authorizationCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  fullName?: {
    firstName?: string;
    lastName?: string;
  };
}
