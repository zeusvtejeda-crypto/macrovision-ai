import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FoodAnalysisService } from './food-analysis.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { CorrectAnalysisDto } from './dto/correct-analysis.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { MealType } from '@enums';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@ApiTags('analysis')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('analysis')
export class FoodAnalysisController {
  constructor(private readonly analysisService: FoodAnalysisService) {}

  // ─── Analizar imagen ──────────────────────────────
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Analizar imagen de alimento con IA',
    description:
      'Sube una foto de tu comida y la IA identificará los alimentos, porciones y macronutrientes. Límite: 3 análisis/día en plan gratuito.',
  })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  analyzeImage(
    @CurrentUser('id') userId: string,
    @CurrentUser('subscriptionStatus') subscriptionStatus: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: /image\/(jpeg|jpg|png|webp|heic)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: CreateAnalysisDto,
  ) {
    return this.analysisService.analyzeImage(
      userId,
      file.buffer,
      file.mimetype,
      dto,
      subscriptionStatus,
    );
  }

  // ─── Historial de análisis ────────────────────────
  @Get()
  @ApiOperation({ summary: 'Historial de análisis del usuario' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getHistory(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.analysisService.getHistory(userId, page, Math.min(limit, 50));
  }

  // ─── Obtener análisis por ID ──────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un análisis' })
  getAnalysis(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.analysisService.getAnalysis(id, userId);
  }

  // ─── Corrección manual ────────────────────────────
  @Patch(':id/correct')
  @ApiOperation({ summary: 'Corregir porciones/ingredientes de un análisis' })
  correctAnalysis(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CorrectAnalysisDto,
  ) {
    return this.analysisService.correctAnalysis(id, userId, dto);
  }

  // ─── Añadir al diario ─────────────────────────────
  @Post(':id/add-to-diary')
  @ApiOperation({ summary: 'Añadir análisis al diario alimenticio' })
  addToDiary(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { mealType: MealType },
  ) {
    return this.analysisService.addToDiary(id, userId, body.mealType);
  }

  // ─── Feedback ─────────────────────────────────────
  @Post(':id/feedback')
  @ApiOperation({ summary: 'Enviar feedback sobre la precisión del análisis' })
  submitFeedback(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      rating: number;
      comment?: string;
      actualCalories?: number;
    },
  ) {
    return this.analysisService.submitFeedback(
      id,
      userId,
      body.rating,
      body.comment,
      body.actualCalories,
    );
  }
}
