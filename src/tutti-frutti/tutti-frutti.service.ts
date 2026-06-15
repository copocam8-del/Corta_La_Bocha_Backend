import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidateRoundDto, ValidationResultDto, ValidateRoundResponseDto } from './dto/validate-round.dto';

interface AiResponse {
  validations: {
    category: string;
    isValid: boolean;
    aiAnswer: string;
    reason?: string;
  }[];
}

@Injectable()
export class TuttiFruttiValidatorService {
  private readonly logger = new Logger(TuttiFruttiValidatorService.name);
  private readonly openaiApiKey: string | undefined;
  private readonly openaiApiUrl = 'https://api.openai.com/v1/chat/completions';

  // Categorías válidas del juego
  private readonly VALID_CATEGORIES = [
    'Jugador',
    'Equipo',
    'DT',
    'Selección',
    'Campeón Champions',
    'Campeón Mundial',
    'Jugador Argentino',
  ];

  constructor(private readonly configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!this.openaiApiKey) {
      this.logger.warn(
        'OPENAI_API_KEY not found in environment variables. AI validation will use fallback mode.',
      );
    }
  }

  async validateRound(dto: ValidateRoundDto): Promise<ValidateRoundResponseDto> {
    // Validar que la letra sea válida
    if (!dto.roundLetter || dto.roundLetter.length !== 1 || !/[A-Z]/.test(dto.roundLetter)) {
      throw new BadRequestException('Invalid round letter. Must be a single uppercase letter.');
    }

    // Validar que todas las categorías sean válidas
    for (const answer of dto.answers) {
      if (!this.VALID_CATEGORIES.includes(answer.category)) {
        throw new BadRequestException(
          `Invalid category: ${answer.category}. Valid categories are: ${this.VALID_CATEGORIES.join(', ')}`,
        );
      }
    }

    // Si no hay respuestas válidas, retornar resultado vacío
    if (!dto.answers || dto.answers.length === 0) {
      return {
        roundLetter: dto.roundLetter,
        totalPoints: 0,
        results: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Procesar validaciones
    const results: ValidationResultDto[] = [];
    let totalPoints = 0;

    for (const answer of dto.answers) {
      let result: ValidationResultDto;

      if (!answer.answer || answer.answer.trim() === '') {
        // Respuesta vacía = 0 puntos
        result = {
          category: answer.category,
          userAnswer: null,
          aiAnswer: null,
          isValid: false,
          reason: 'Empty answer',
          points: 0,
        };
      } else {
        // Validar con IA
        result = await this.validateWithAi(answer.category, dto.roundLetter, answer.answer.trim());
      }

      results.push(result);
      totalPoints += result.points;
    }

    return {
      roundLetter: dto.roundLetter,
      totalPoints,
      results,
      timestamp: new Date().toISOString(),
    };
  }

  private async validateWithAi(
    category: string,
    roundLetter: string,
    userAnswer: string,
  ): Promise<ValidationResultDto> {
    if (!this.openaiApiKey) {
      // Fallback: usar validación básica si no hay API key
      return this.fallbackValidation(category, roundLetter, userAnswer);
    }

    try {
      const aiResponse = await this.callOpenAiApi(category, roundLetter, userAnswer);
      return this.parseAiResponse(category, userAnswer, aiResponse);
    } catch (error) {
      this.logger.error(`AI validation failed: ${error.message}. Using fallback.`);
      return this.fallbackValidation(category, roundLetter, userAnswer);
    }
  }

  private async callOpenAiApi(
    category: string,
    roundLetter: string,
    userAnswer: string,
  ): Promise<AiResponse> {
    const prompt = this.buildValidationPrompt(category, roundLetter, userAnswer);

    try {
      const response = await fetch(this.openaiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are an expert football/soccer validator. You must respond ONLY with valid JSON, no additional text.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'validation_response',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  validations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        category: { type: 'string' },
                        isValid: { type: 'boolean' },
                        aiAnswer: { type: 'string' },
                        reason: { type: 'string' },
                      },
                      required: ['category', 'isValid', 'aiAnswer', 'reason'],
                    },
                  },
                },
                required: ['validations'],
                additionalProperties: false,
              },
            },
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse JSON response
      const parsed = JSON.parse(content) as AiResponse;
      return parsed;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to validate with AI: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildValidationPrompt(category: string, roundLetter: string, userAnswer: string): string {
    const categoryRules = this.getCategoryRules(category);

    return `Validate the following football/soccer answer in Spanish for a game called "Tutti Frutti":

Category: ${category}
Round Letter: ${roundLetter}
User Answer: "${userAnswer}"

Category Rules:
${categoryRules}

Validation Rules:
1. The answer must start with the letter "${roundLetter}"
2. The answer must be a real entity in football (player, team, coach, national team, etc.)
3. Apply the specific rules for this category (see above)
4. The answer cannot be an empty string or whitespace
5. The answer should be a common/known entity in football, not extremely obscure

Respond with ONLY a JSON object in this exact format (no additional text):
{
  "validations": [
    {
      "category": "${category}",
      "isValid": true or false,
      "aiAnswer": "the correct/similar answer if valid, or alternative if not",
      "reason": "brief explanation in Spanish of why it's valid or invalid"
    }
  ]
}`;
  }

  private getCategoryRules(category: string): string {
    const rules: Record<string, string> = {
      Jugador: 'Must be a real football player (current or historical)',
      Equipo: 'Must be a real football club/team',
      DT: 'Must be a real football coach/manager (Director Técnico)',
      Selección: 'Must be a real national team',
      'Campeón Champions': 'Must be a team that won the UEFA Champions League',
      'Campeón Mundial': 'Must be a team that won the FIFA World Cup',
      'Jugador Argentino':
        'Must be a real Argentine football player (nationality or dual nationality counts)',
    };
    return rules[category] || 'No specific rules';
  }

  private parseAiResponse(
    category: string,
    userAnswer: string,
    aiResponse: AiResponse,
  ): ValidationResultDto {
    if (!aiResponse.validations || aiResponse.validations.length === 0) {
      throw new Error('Invalid AI response format');
    }

    const validation = aiResponse.validations[0];

    if (!validation.isValid) {
      return {
        category,
        userAnswer,
        aiAnswer: validation.aiAnswer || null,
        isValid: false,
        reason: validation.reason || 'Answer does not meet category requirements',
        points: 0,
      };
    }

    // Determine points based on whether answer matches AI suggestion
    const isExactMatch = this.normalizeString(userAnswer) === this.normalizeString(validation.aiAnswer);
    const points = isExactMatch ? 5 : 10; // 10 if unique/different, 5 if same

    return {
      category,
      userAnswer,
      aiAnswer: validation.aiAnswer,
      isValid: true,
      reason: validation.reason || 'Valid answer for this category',
      points,
    };
  }

  private fallbackValidation(
    category: string,
    roundLetter: string,
    userAnswer: string,
  ): ValidationResultDto {
    // Basic validation when AI is not available
    const normalizedAnswer = userAnswer.trim().toLowerCase();
    const startsWithLetter = normalizedAnswer[0]?.toUpperCase() === roundLetter;

    if (!startsWithLetter) {
      return {
        category,
        userAnswer,
        aiAnswer: null,
        isValid: false,
        reason: `Answer must start with letter "${roundLetter}"`,
        points: 0,
      };
    }

    // If basic validation passes, assume valid and award 5 points
    // (conservative approach when AI unavailable)
    return {
      category,
      userAnswer,
      aiAnswer: userAnswer,
      isValid: true,
      reason: 'Validated with fallback rules (AI unavailable)',
      points: 5,
    };
  }

  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
