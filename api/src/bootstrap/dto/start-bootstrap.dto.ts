import { IsEmail, IsNotEmpty, IsString, IsTimeZone, MinLength } from 'class-validator';

export class StartBootstrapDto {
  @IsString()
  @IsNotEmpty()
  primaryDomain: string;

  @IsString()
  @IsNotEmpty()
  mailDomain: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(12)
  adminPassword: string;

  @IsString()
  @IsNotEmpty()
  hostname: string;

  @IsTimeZone()
  timezone: string;
}
