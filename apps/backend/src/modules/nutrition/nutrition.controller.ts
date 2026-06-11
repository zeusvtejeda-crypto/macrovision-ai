import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NutritionService } from './nutrition.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';

@ApiTags('nutrition')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('nutrition')
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  @Get('search')
  @ApiOperation({ summary: 'Buscar alimentos en la base de datos' })
  @ApiQuery({ name: 'q', description: 'Término de búsqueda' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  search(
    @Query('q') query: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.nutritionService.searchFoods(query, page, Math.min(limit, 50));
  }

  @Get('barcode/:code')
  @ApiOperation({ summary: 'Buscar alimento por código de barras' })
  searchByBarcode(@Param('code') barcode: string) {
    return this.nutritionService.searchByBarcode(barcode);
  }

  @Get('foods/:id')
  @ApiOperation({ summary: 'Obtener alimento por ID' })
  getFoodById(@Param('id') id: string) {
    return this.nutritionService.getFoodById(id);
  }

  @Post('calculate-portion')
  @ApiOperation({ summary: 'Calcular nutrición para una porción específica' })
  calculatePortion(
    @Body()
    body: {
      foodId: string;
      portionGrams: number;
    },
  ) {
    return this.nutritionService
      .getFoodById(body.foodId)
      .then((food) => {
        if (!food) throw new Error('Alimento no encontrado');
        return this.nutritionService.calculatePortion(food as { calories: number; protein: number; carbohydrates: number; fat: number; fiber?: number | null }, body.portionGrams);
      });
  }

  @Get('frequent')
  @ApiOperation({ summary: 'Alimentos más frecuentes del usuario' })
  getFrequent(
    @CurrentUser('id') userId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.nutritionService.getFrequentFoods(userId, limit);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Alimentos usados recientemente' })
  getRecent(
    @CurrentUser('id') userId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.nutritionService.getRecentFoods(userId, limit);
  }
}
