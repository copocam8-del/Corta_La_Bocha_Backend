import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ValidateRoundDto } from '../src/tutti-frutti/dto/validate-round.dto';

describe('TuttiFrutti E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /tutti-frutti/validate-round', () => {
    it('should validate a valid round successfully', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'M',
        answers: [
          {
            category: 'Jugador',
            answer: 'Messi',
          },
          {
            category: 'Equipo',
            answer: 'Manchester City',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body).toHaveProperty('roundLetter');
      expect(response.body).toHaveProperty('totalPoints');
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.roundLetter).toBe('M');
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBe(2);
    });

    it('should return 400 for invalid round letter', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'AB',
        answers: [],
      };

      await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(400);
    });

    it('should return 400 for invalid category', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'InvalidCategory',
            answer: 'Answer',
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(400);
    });

    it('should handle empty answers array', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body.totalPoints).toBe(0);
      expect(response.body.results).toEqual([]);
    });

    it('should return 0 points for empty answers', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'Jugador',
            answer: '',
          },
          {
            category: 'Equipo',
            answer: null,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body.totalPoints).toBe(0);
      response.body.results.forEach((result) => {
        expect(result.points).toBe(0);
        expect(result.isValid).toBe(false);
      });
    });

    it('should validate all categories', async () => {
      const categories = ['Jugador', 'Equipo', 'DT', 'Selección', 'Campeón Champions', 'Campeón Mundial', 'Jugador Argentino'];

      const dto: ValidateRoundDto = {
        roundLetter: 'T',
        answers: categories.map((cat) => ({
          category: cat,
          answer: `Test${cat}`,
        })),
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body.results.length).toBe(categories.length);
      response.body.results.forEach((result) => {
        expect(categories).toContain(result.category);
      });
    });

    it('should return structured validation results', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'A',
        answers: [
          {
            category: 'Jugador',
            answer: 'Aguero',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      const result = response.body.results[0];
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('userAnswer');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('points');
      expect(result).toHaveProperty('reason');
      expect(typeof result.points).toBe('number');
      expect(typeof result.isValid).toBe('boolean');
    });

    it('should calculate points correctly (0 for invalid)', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'M',
        answers: [
          {
            category: 'Jugador',
            answer: 'Benzema', // Starts with B, not M
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body.results[0].points).toBe(0);
      expect(response.body.results[0].isValid).toBe(false);
    });

    it('should handle mixed valid and invalid answers', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'P',
        answers: [
          {
            category: 'Jugador',
            answer: 'Pele',
          },
          {
            category: 'Equipo',
            answer: '', // Invalid
          },
          {
            category: 'DT',
            answer: 'Pep Guardiola',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body.results.length).toBe(3);
      expect(response.body.results[1].points).toBe(0); // Empty answer
    });

    it('should return 400 for missing roundLetter', async () => {
      const dto = {
        answers: [
          {
            category: 'Jugador',
            answer: 'Messi',
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(400);
    });

    it('should return 400 for missing answers array', async () => {
      const dto = {
        roundLetter: 'M',
      };

      await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(400);
    });

    it('should trim whitespace from user answers', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'J',
        answers: [
          {
            category: 'Jugador',
            answer: '  Jorginho  ',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body.results[0].userAnswer).toBe('Jorginho');
    });

    it('should handle special characters in answers', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'O',
        answers: [
          {
            category: 'Equipo',
            answer: "O'Neill United",
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body.results[0]).toHaveProperty('points');
    });

    it('should handle optional matchId field', async () => {
      const dto: ValidateRoundDto = {
        roundLetter: 'M',
        answers: [
          {
            category: 'Jugador',
            answer: 'Messi',
          },
        ],
        matchId: 'optional-match-id-123',
      };

      const response = await request(app.getHttpServer())
        .post('/tutti-frutti/validate-round')
        .send(dto)
        .expect(200);

      expect(response.body).toHaveProperty('totalPoints');
    });
  });
});
