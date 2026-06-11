import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';

@ApiTags('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('onboarding')
  @ApiOperation({ summary: 'Completar onboarding y calcular TDEE' })
  completeOnboarding(
    @CurrentUser('id') userId: string,
    @Body() dto: OnboardingDto,
  ) {
    return this.usersService.completeOnboarding(userId, dto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Obtener perfil del usuario' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Actualizar perfil' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard nutricional del día' })
  getDashboard(@CurrentUser('id') userId: string) {
    return this.usersService.getDashboard(userId);
  }

  @Get('weekly-summary')
  @ApiOperation({ summary: 'Resumen nutricional de la semana' })
  getWeeklySummary(@CurrentUser('id') userId: string) {
    return this.usersService.getWeeklySummary(userId);
  }

  @Post('weight')
  @ApiOperation({ summary: 'Registrar peso corporal' })
  logWeight(
    @CurrentUser('id') userId: string,
    @Body() body: { weight: number; note?: string },
  ) {
    return this.usersService.logWeight(userId, body.weight, body.note);
  }

  @Get('weight-history')
  @ApiOperation({ summary: 'Historial de peso' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getWeightHistory(
    @CurrentUser('id') userId: string,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.usersService.getWeightHistory(userId, days);
  }

  @Post('recalculate-tdee')
  @ApiOperation({ summary: 'Recalcular TDEE con datos actuales' })
  recalculateTdee(@CurrentUser('id') userId: string) {
    return this.usersService.recalculateTdee(userId);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Cambiar contraseña' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );
  }
}
