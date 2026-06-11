import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { Public } from '@common/decorators/public.decorator';
import { UserRole } from '@enums';

@ApiTags('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Health check — público para load balancers
  @Public()
  @Get('/health')
  health() {
    return this.adminService.healthCheck();
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Métricas generales del sistema' })
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('users')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lista de usuarios' })
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(page, limit, search);
  }

  @Get('analyses/failed')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Análisis fallidos de IA' })
  getFailedAnalyses(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getFailedAnalyses(page, limit);
  }

  @Get('feedback')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Feedback de usuarios sobre la precisión IA' })
  getAiFeedback(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getAiFeedback(page, limit);
  }
}
