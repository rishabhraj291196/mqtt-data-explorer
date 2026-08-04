import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('reports the API as healthy and lists its endpoints', () => {
      const info = appController.getInfo();
      expect(info.status).toBe('ok');
      expect(info.endpoints.length).toBeGreaterThan(0);
    });
  });
});
