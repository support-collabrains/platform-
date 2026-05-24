import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  private authorize(key: string | undefined) {
    const expected = this.config.get<string>('AUTHENTIK_WEBHOOK_SECRET');
    if (expected && key !== `Bearer ${expected}`) throw new UnauthorizedException();
  }

  @Get('users')
  async listUsers(@Headers('authorization') auth: string) {
    this.authorize(auth);
    return this.adminService.listUsers();
  }

  @Post('users')
  async createUser(
    @Headers('authorization') auth: string,
    @Body() body: { username: string; name: string; email: string; password: string; phone?: string; phone2?: string },
  ) {
    this.authorize(auth);
    const pk = await this.adminService.createUser(body.username, body.name, body.email, body.password, body.phone, body.phone2);
    await this.usersService.onboardUser(pk);
    return { ok: true, pk };
  }

  @Delete('users/:pk')
  @HttpCode(204)
  async deleteUser(@Headers('authorization') auth: string, @Param('pk') pk: string) {
    this.authorize(auth);
    await this.adminService.deleteUser(Number(pk));
  }

  @Patch('apply-branding')
  async applyBranding(@Headers('authorization') auth: string) {
    this.authorize(auth);
    await this.adminService.applyBranding();
    return { ok: true };
  }
}
