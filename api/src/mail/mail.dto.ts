import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean } from 'class-validator';

export class SendMailDto {
  @IsEmail()
  to!: string;

  @IsNotEmpty()
  @IsString()
  subject!: string;

  @IsNotEmpty()
  @IsString()
  bodyHtml!: string;
}

export class VacationDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

export interface FolderStat {
  name: string;
  unread: number;
}

export interface MailStats {
  unread: number;
  folders: FolderStat[];
}

export interface MailMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
  hasAttachment: boolean;
}

export interface MailDetail {
  uid: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  seen: boolean;
  bodyHtml: string;
  bodyText: string;
}

export interface VacationState {
  active: boolean;
  subject: string;
  body: string;
}
