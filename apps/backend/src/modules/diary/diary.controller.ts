import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DiaryService } from './diary.service';
import {
  CreateDiaryEntryDto,
  AddFoodToEntryDto,
  UpdateDiaryEntryDto,
} from './dto/diary.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';

@ApiTags('diary')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('diary')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Obtener diario de un día específico' })
  @ApiQuery({ name: 'date', example: '2024-01-15' })
  getDailyDiary(
    @CurrentUser('id') userId: string,
    @Query('date') date: string,
  ) {
    const d = date || new Date().toISOString().split('T')[0];
    return this.diaryService.getDailyDiary(userId, d);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Días con registros en un mes' })
  @ApiQuery({ name: 'year', example: 2024 })
  @ApiQuery({ name: 'month', example: 1 })
  getLoggedDates(
    @CurrentUser('id') userId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.diaryService.getLoggedDates(userId, year, month);
  }

  @Post()
  @ApiOperation({ summary: 'Crear entrada del diario' })
  createEntry(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDiaryEntryDto,
  ) {
    return this.diaryService.createEntry(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar entrada del diario' })
  updateEntry(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateDiaryEntryDto,
  ) {
    return this.diaryService.updateEntry(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar entrada del diario' })
  deleteEntry(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.diaryService.deleteEntry(id, userId);
  }

  @Post(':id/foods')
  @ApiOperation({ summary: 'Añadir alimento a una entrada' })
  addFood(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddFoodToEntryDto,
  ) {
    return this.diaryService.addFoodToEntry(id, userId, dto);
  }

  @Delete(':id/foods/:foodEntryId')
  @ApiOperation({ summary: 'Eliminar alimento de una entrada' })
  removeFood(
    @Param('id') id: string,
    @Param('foodEntryId') foodEntryId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.diaryService.removeFoodFromEntry(id, foodEntryId, userId);
  }
}
